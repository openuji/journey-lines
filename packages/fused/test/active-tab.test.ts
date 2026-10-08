import { describe, expect, it, vi } from 'vitest';
import { createFakeTabHost, type FakeCdpTransport } from '@openuji/cdp/testing';
import type { CaptureSink, MilestoneCapture } from '@openuji/core';
import { recordActiveTab } from '@openuji/fused';
import { frameNavigated, screencastFrame, showingDocument } from '../../cdp/test/events.js';

/**
 * The follow rules, once for every host: a fake TabHost plays the browser —
 * which tab is active, how attaches answer, when sessions end.
 */

class MemorySink implements CaptureSink {
  public readonly name = 'memory';
  public readonly captures: MilestoneCapture[] = [];
  public enqueue(capture: MilestoneCapture): void {
    this.captures.push(capture);
  }
  public async drain(): Promise<void> {}
}

/** Let attaches, moves and the consumer loop catch up. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const screencast = { viewport: { width: 1280, height: 800 } };

/** A command that answers only when the test says so: a page still loading. */
function holdCommand(cdp: FakeCdpTransport, method: 'Page.getFrameTree' | 'Runtime.addBinding') {
  let answer: (error?: Error) => void = () => {};
  cdp.respond(
    method,
    () =>
      new Promise((resolve, reject) => {
        answer = (error) => (error ? reject(error) : resolve({}));
      }) as never,
  );
  return (error?: Error) => answer(error);
}

async function setup(prepare?: (cdp: FakeCdpTransport, tab: string, attachNo: number) => void) {
  /** Which document each tab shows when a session attaches to it. */
  const documents = new Map([
    ['A', 'loader-a'],
    ['B', 'loader-b'],
    ['C', 'loader-c'],
  ]);
  const attachNo = new Map<string, number>();
  const host = createFakeTabHost<string>({
    startAtMs: 1_000,
    prepare: (cdp, tab) => {
      showingDocument(cdp, documents.get(tab) ?? `loader-${tab}`);
      const no = (attachNo.get(tab) ?? 0) + 1;
      attachNo.set(tab, no);
      prepare?.(cdp, tab, no);
    },
  });
  const sink = new MemorySink();
  const states: string[] = [];
  const onEnd = vi.fn();
  const recording = await recordActiveTab(host, 'A', { sinks: [sink], screencast });
  recording.onStatus(({ active: { tab, state }, ended }) => {
    if (ended) onEnd(ended);
    else states.push(`${tab} ${state}`);
  });
  await settle();

  /** `viewId entry label` of every capture. */
  const journey = () => sink.captures.map((c) => `${c.viewId} ${c.entry} ${c.label}`);
  return { host, recording, documents, states, onEnd, journey };
}

describe('recordActiveTab', () => {
  it('follows a new active tab: the sources move, the tab left keeps its session, a tab view begins', async () => {
    const { host, recording, states, journey } = await setup();
    screencastFrame(host.session('A').cdp);

    host.activate('B');
    await settle();
    screencastFrame(host.session('B').cdp);
    await settle();
    await recording.stop();

    expect(journey()).toEqual([
      '1 load 00-first',
      '1 load 99-before-navigation',
      '2 tab 00-first',
      '2 tab 99-before-navigation',
    ]);
    expect(states).toEqual(['B attaching', 'B recording']);
    expect(host.attaches).toEqual(['A', 'B']);
    // Kept until Stop, then every session is handed back.
    expect([host.session('A').closed, host.session('B').closed]).toEqual([true, true]);
  });

  it('never waits on an attach: back to A at once, and B handed back the moment it lands', async () => {
    const { host, recording, states, journey } = await setup();
    screencastFrame(host.session('A').cdp);
    host.hold('B');

    host.activate('B');
    host.activate('A');
    await settle();
    expect(states).toEqual(['B attaching', 'A attaching', 'A recording']);

    host.settle('B');
    await settle();
    expect(host.session('B').closed).toBe(true);

    // A flick to a tab that never attached, and back, leaves the view as it was.
    screencastFrame(host.session('A').cdp);
    await settle();
    await recording.stop();
    expect(journey()).toEqual(['1 load 00-first', '1 load 99-before-navigation']);
  });

  it('never waits on a page that is still loading either', async () => {
    let answerB = (_error?: Error): void => {};
    const { host, recording, states } = await setup((cdp, tab) => {
      if (tab === 'B') answerB = holdCommand(cdp, 'Page.getFrameTree');
    });

    host.activate('B');
    await settle();
    host.activate('A');
    await settle();
    expect(states.at(-1)).toBe('A recording');
    expect(recording.cdp).toBe(host.session('A').cdp);

    answerB();
    await settle();
    expect(states.at(-1)).toBe('A recording');
    await recording.stop();
  });

  it('attaches a tab once: activated again while its attach is on the way, it waits for that one', async () => {
    const { host, recording, states } = await setup();
    host.hold('B');

    host.activate('B');
    host.activate('A');
    host.activate('B');
    host.settle('B');
    await settle();

    expect(host.attaches).toEqual(['A', 'B']);
    expect(states.at(-1)).toBe('B recording');
    await recording.stop();
  });

  it('switching back to a recorded tab moves the sources without attaching', async () => {
    const { host, recording, states } = await setup();

    host.activate('B');
    await settle();
    host.activate('A');
    await settle();

    expect(host.attaches).toEqual(['A', 'B']);
    expect(states).toEqual(['B attaching', 'B recording', 'A attaching', 'A recording']);
    await recording.stop();
  });

  it('a session dying while the sources move onto it: never reported as recording, and the tab attached again', async () => {
    let answerFirstB = (_error?: Error): void => {};
    const { host, recording, states } = await setup((cdp, tab, attachNo) => {
      if (tab === 'B' && attachNo === 1) answerFirstB = holdCommand(cdp, 'Page.getFrameTree');
    });

    host.activate('B');
    await settle();
    const firstB = host.session('B');
    firstB.end('lost');
    answerFirstB(new Error('Debugger is not attached'));
    await settle();

    expect(host.attaches).toEqual(['A', 'B', 'B']);
    expect(host.session('B')).not.toBe(firstB);
    expect(states).toEqual(['B attaching', 'B recording']);
    await recording.stop();
  });

  it('a live session the sources will not go onto counts as refused', async () => {
    const { host, recording, states } = await setup((cdp, tab) => {
      if (tab === 'B') {
        cdp.respond('Runtime.addBinding', () => {
          throw new Error('Runtime.addBinding failed');
        });
      }
    });

    host.activate('B');
    await settle();

    expect(states).toEqual(['B attaching', 'B refused']);
    expect(host.session('B').closed).toBe(true);
    expect(recording.cdp).toBeNull();
    await recording.stop();
  });

  it('pauses on a tab the host refuses, and resumes when the host reports it again', async () => {
    const { host, recording, states } = await setup();
    host.refuse('C');

    host.activate('C');
    await settle();
    expect(states.at(-1)).toBe('C refused');
    expect(recording.cdp).toBeNull();

    host.refuse('C', false);
    host.activate('C'); // it committed a page Chrome lets extensions record
    await settle();
    expect(states.slice(-2)).toEqual(['C attaching', 'C recording']);
    await recording.stop();
  });

  it('a PDF: the session Chrome took away is attached again, and the view goes on across both', async () => {
    const { host, recording, documents, journey } = await setup();
    const first = host.session('A');
    screencastFrame(first.cdp);
    frameNavigated(first.cdp, 'loader-pdf'); // the PDF commits
    documents.set('A', 'loader-pdf');
    first.end('lost'); // and Chrome takes the debugger away
    await settle();

    screencastFrame(host.session('A').cdp);
    await settle();
    await recording.stop();

    expect(host.attaches).toEqual(['A', 'A']);
    expect(journey()).toEqual([
      '1 load 00-first',
      '1 load 99-before-navigation',
      '2 load 00-first',
      '2 load 99-before-navigation',
    ]);
  });

  it('a closed tab hands over to the tab that becomes active next', async () => {
    const { host, recording, states, journey } = await setup();
    host.activate('B');
    await settle();

    host.refuse('B'); // closed: it can't be attached any more
    host.session('B').end('lost');
    host.activate('A');
    await settle();
    screencastFrame(host.session('A').cdp);
    await settle();
    await recording.stop();

    expect(states.at(-1)).toBe('A recording');
    expect(journey().map((line) => line.split(' ').slice(0, 2).join(' '))).toContain('3 tab');
  });

  it('ends when the window is gone, or when the person withdraws permission', async () => {
    const gone = await setup();
    gone.host.gone();
    gone.host.activate('B');
    expect(gone.onEnd).toHaveBeenCalledWith('gone');
    expect(gone.host.attaches).toEqual(['A']);
    await gone.recording.stop();

    const revoked = await setup();
    revoked.host.session('A').end('revoked');
    expect(revoked.onEnd).toHaveBeenCalledWith('revoked');
    await revoked.recording.stop();
  });

  it('stops at once while an attach is pending, and hands back every tab, the late one too', async () => {
    const { host, recording } = await setup();
    host.hold('B');
    host.activate('B');

    await recording.stop();
    expect(host.session('A').closed).toBe(true);

    host.settle('B');
    await settle();
    expect(host.session('B').closed).toBe(true);
  });

  it('only the latest move speaks: the tab left behind reports nothing', async () => {
    const { host, recording, journey } = await setup();
    screencastFrame(host.session('A').cdp);
    host.activate('B');
    await settle();

    // Still attached, but not the active tab: what it paints is not recorded.
    screencastFrame(host.session('A').cdp, { scrollY: 555 });
    screencastFrame(host.session('B').cdp);
    await settle();
    await recording.stop();

    expect(journey()).toEqual([
      '1 load 00-first',
      '1 load 99-before-navigation',
      '2 tab 00-first',
      '2 tab 99-before-navigation',
    ]);
  });
});
