import { describe, expect, it } from 'vitest';
import {
  follow,
  initialFollowState,
  statusOf,
  type FollowEffect,
  type FollowEvent,
  type FollowState,
} from '@openuji/fused';

/**
 * The follow rules as plain values: tabs are letters, sessions are `tab#n`.
 * Each race is a list of events, in the order they arrive; the effects come
 * out as words.
 */

type Event = FollowEvent<string, string>;

const active = (tab: string): Event => ({ type: 'active', tab });
const attached = (session: string): Event => ({ type: 'attached', tab: session[0]!, session });
const attachFailed = (tab: string): Event => ({ type: 'attach-failed', tab });
const moved = (move: number): Event => ({ type: 'moved', move });
const moveFailed = (session: string): Event => ({ type: 'move-failed', tab: session[0]!, session });
const lost = (session: string): Event => ({ type: 'session-ended', tab: session[0]!, session, end: 'lost' });
const revoked = (session: string): Event => ({ type: 'session-ended', tab: session[0]!, session, end: 'revoked' });

function word(effect: FollowEffect<string, string>): string {
  switch (effect.type) {
    case 'attach':
      return `attach ${effect.tab}`;
    case 'move':
      return `move ${effect.move} to ${effect.session}${effect.otherTab ? ', another tab' : ''}`;
    case 'release':
      return 'release';
    case 'close':
      return `close ${effect.session}`;
  }
}

/** Recording A over `A#1`, then `events`. */
function run(events: readonly Event[], from: FollowState<string, string> = initialFollowState('A', 'A#1')) {
  let state = from;
  const effects: string[] = [];
  for (const event of events) {
    const result = follow(state, event);
    state = result.state;
    effects.push(...result.effects.map(word));
  }
  const { active, ended } = statusOf(state);
  return { state, effects, status: `${active.tab} ${active.state}${ended ? `, ${ended}` : ''}` };
}

describe('follow', () => {
  it('starts recording its first tab', () => {
    expect(run([]).status).toBe('A recording');
  });

  it('follows a new tab: off A at once, B attached, the sources moved once it lands', () => {
    expect(run([active('B')])).toMatchObject({ effects: ['release', 'attach B'], status: 'B attaching' });
    expect(run([active('B'), attached('B#1'), moved(1)])).toMatchObject({
      effects: ['release', 'attach B', 'move 1 to B#1, another tab'],
      status: 'B recording',
    });
  });

  it('an attach that lands after you left is handed back at once', () => {
    expect(run([active('B'), active('A'), attached('B#1'), moved(1)])).toMatchObject({
      // Back on A: the same tab, so the view goes on as it was.
      effects: ['release', 'attach B', 'move 1 to A#1', 'close B#1'],
      status: 'A recording',
    });
  });

  it('a tab activated again while its attach is on the way waits for that one', () => {
    expect(run([active('B'), active('A'), active('B'), attached('B#1'), moved(2)])).toMatchObject({
      effects: ['release', 'attach B', 'move 1 to A#1', 'release', 'move 2 to B#1, another tab'],
      status: 'B recording',
    });
  });

  it('switching back to a recorded tab moves the sources without attaching', () => {
    expect(run([active('B'), attached('B#1'), moved(1), active('A'), moved(2)])).toMatchObject({
      effects: ['release', 'attach B', 'move 1 to B#1, another tab', 'move 2 to A#1, another tab'],
      status: 'A recording',
    });
  });

  it('only the last move counts: an older one landing late says nothing', () => {
    const switched = [active('B'), attached('B#1'), active('A'), active('B'), active('A')];
    expect(run([...switched, moved(3)]).status).toBe('A attaching');
    expect(run([...switched, moved(3), moved(4)]).status).toBe('A recording');
  });

  it('a session dying while the sources move onto it: never recording, and the tab attached again', () => {
    expect(
      run([active('B'), attached('B#1'), lost('B#1'), moveFailed('B#1'), moved(1), attached('B#2'), moved(2)]),
    ).toMatchObject({
      effects: ['release', 'attach B', 'move 1 to B#1, another tab', 'release', 'attach B', 'move 2 to B#2'],
      status: 'B recording',
    });
    expect(run([active('B'), attached('B#1'), lost('B#1'), moved(1)]).status).toBe('B attaching');
  });

  it('a live session the sources will not go onto counts as refused', () => {
    expect(run([active('B'), attached('B#1'), moveFailed('B#1')])).toMatchObject({
      effects: ['release', 'attach B', 'move 1 to B#1, another tab', 'close B#1', 'release'],
      status: 'B refused',
    });
  });

  it('pauses on a tab the host refuses, and tries again when the host reports it again', () => {
    expect(run([active('C'), attachFailed('C')]).status).toBe('C refused');
    expect(run([active('C'), attachFailed('C'), active('C')])).toMatchObject({
      effects: ['release', 'attach C', 'attach C'],
      status: 'C attaching',
    });
  });

  it('a refusal for a tab you already left changes nothing', () => {
    expect(run([active('C'), active('A'), attachFailed('C'), moved(1)]).status).toBe('A recording');
  });

  it('a PDF: the session Chrome took away is attached again, and the same tab goes on', () => {
    expect(run([lost('A#1'), attached('A#2'), moved(1)])).toMatchObject({
      effects: ['release', 'attach A', 'move 1 to A#2'],
      status: 'A recording',
    });
  });

  it('a closed tab hands over to the next active one, whichever Chrome says first', () => {
    const onB = [active('B'), attached('B#1'), moved(1)];
    // The next tab first, then the closed one's session ending.
    expect(run([...onB, active('A'), lost('B#1'), moved(2)])).toMatchObject({
      status: 'A recording',
      state: { sessions: new Map([['A', 'A#1']]) },
    });
    // The other way round: B can't be attached any more, then A is reported.
    expect(run([...onB, lost('B#1'), attachFailed('B'), active('A'), moved(2)])).toMatchObject({
      effects: [
        'release', 'attach B', 'move 1 to B#1, another tab',
        'release', 'attach B',
        'move 2 to A#1, another tab',
      ],
      status: 'A recording',
    });
  });

  it('a tab left behind can end: its session goes, and nothing else changes', () => {
    expect(run([active('B'), attached('B#1'), moved(1), lost('A#1')])).toMatchObject({
      effects: ['release', 'attach B', 'move 1 to B#1, another tab'],
      status: 'B recording',
      state: { sessions: new Map([['B', 'B#1']]) },
    });
  });

  it('ends when the window or browser is gone, or permission is withdrawn', () => {
    expect(run([{ type: 'gone' }, active('B')])).toMatchObject({ effects: [], status: 'A recording, gone' });
    expect(run([revoked('A#1'), active('B')])).toMatchObject({ effects: [], status: 'A recording, revoked' });
  });

  it('after Stop, a session that lands is handed back, and nothing else happens', () => {
    expect(run([active('B'), { type: 'stop' }, attached('B#1'), active('C')])).toMatchObject({
      effects: ['release', 'attach B', 'close B#1'],
      status: 'B attaching',
    });
  });
});
