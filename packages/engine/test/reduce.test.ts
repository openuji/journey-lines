import { describe, expect, it } from 'vitest';
import type { ClipWrite, DomainEvent, MilestoneCapture } from '@openuji/core';
import {
  RulesEngine,
  captureFor,
  initialEngineState,
  reduce,
  unchanged,
  type MilestoneRule,
} from '@openuji/engine';
import { defaultDocumentRules } from '@openuji/rules-document';
import { navigated, frameEvent, milestone, quiet, withinDocument } from './helpers.js';

/** Records every event it is shown, so we can assert on engine dispatch. */
function spyRule(id: string): MilestoneRule<string[]> & {
  seen: string[][];
  previous: (string[] | undefined)[];
} {
  const seen: string[][] = [];
  const previous: (string[] | undefined)[] = [];
  return {
    id,
    seen,
    previous,
    init: (_view, prior) => {
      previous.push(prior);
      const log: string[] = [];
      seen.push(log);
      return log;
    },
    evaluate: (state, event) => {
      state.push(event.type === 'navigated' && event.sameDocument ? 'url-update' : event.type);
      return unchanged(state);
    },
  };
}

function run(
  events: readonly DomainEvent[],
  rules: readonly MilestoneRule[],
): MilestoneCapture[] {
  const engine = new RulesEngine(rules);
  return events.flatMap((event) => [...engine.processEvent(event).captures]);
}

const page = (path: string): string => `https://example.com${path}`;

describe('reduce', () => {
  it('ignores everything until a main-frame document commits', () => {
    const { state, captures } = reduce(
      initialEngineState,
      frameEvent(),
      defaultDocumentRules,
    );

    expect(captures).toEqual([]);
    expect(state.currentView).toBeNull();
  });

  it('numbers views and documents across navigations', () => {
    const engine = new RulesEngine(defaultDocumentRules);
    const current = () => engine.currentState.currentView;

    engine.processEvent(navigated('loader-a', page('/')));
    expect(current()).toMatchObject({ id: 1, documentId: 1, entry: 'load' });

    engine.processEvent(withinDocument(page('/inbox'), 'loader-a'));
    expect(current()).toMatchObject({
      id: 2,
      documentId: 1,
      loaderId: 'loader-a',
      url: page('/inbox'),
      entry: 'route',
    });

    engine.processEvent(navigated('loader-b'));
    expect(current()).toMatchObject({ id: 3, documentId: 2, entry: 'load' });
  });

  it('keeps view identity and rule state across a same-loader redirect', () => {
    const engine = new RulesEngine(defaultDocumentRules);

    engine.processEvent(navigated('loader-a', page('/one')));
    const first = engine.processEvent(frameEvent()).captures;
    expect(first.map((c) => c.label)).toEqual(['00-first']);

    // Same loaderId: a URL update, not a new view.
    engine.processEvent(navigated('loader-a', page('/two')));
    expect(engine.currentState.currentView?.id).toBe(1);
    expect(engine.currentState.currentView?.url).toBe(page('/two'));

    // first-frame already fired for this view and must not fire again.
    expect(engine.processEvent(frameEvent()).captures).toEqual([]);
  });

  it('updates the URL in place when a same-document change is not a route', () => {
    const spy = spyRule('spy');
    const engine = new RulesEngine([spy, ...defaultDocumentRules]);

    engine.processEvent(navigated('loader-a', page('/list')));
    engine.processEvent(frameEvent());
    engine.processEvent(withinDocument(page('/list?q=shoes')));
    const captures = engine.processEvent({ type: 'stop' }).captures;

    expect(engine.currentState.currentView).toMatchObject({ id: 1, url: page('/list?q=shoes') });
    // No boundary: one view, and the URL update reaches the rules as is.
    expect(spy.seen).toEqual([['frame', 'url-update', 'stop']]);
    expect(captures[0]?.url).toBe(page('/list?q=shoes'));
  });

  it('honours a custom route policy', () => {
    const engine = new RulesEngine(defaultDocumentRules, {
      routePolicy: (from, to) => from !== to,
    });

    engine.processEvent(navigated('loader-a', page('/list')));
    engine.processEvent(withinDocument(page('/list?q=shoes')));

    expect(engine.currentState.currentView).toMatchObject({ id: 2, entry: 'route' });
  });

  it("ignores a subframe's same-document navigation", () => {
    const engine = new RulesEngine(defaultDocumentRules);

    engine.processEvent(navigated('loader-a', page('/')));
    engine.processEvent(withinDocument(page('/ad#/slot'), 'loader-ad', { isMainFrame: false }));

    expect(engine.currentState.currentView).toMatchObject({ id: 1, url: page('/') });
  });

  it('ignores a same-document navigation before any view', () => {
    const { state } = reduce(initialEngineState, withinDocument(page('/b')), defaultDocumentRules);

    expect(state.currentView).toBeNull();
  });

  it('resets rule state for each new view', () => {
    const engine = new RulesEngine(defaultDocumentRules);

    engine.processEvent(navigated('loader-a'));
    expect(engine.processEvent(frameEvent()).captures.map((c) => c.label)).toEqual([
      '00-first',
    ]);

    engine.processEvent(navigated('loader-b'));
    const captures = engine.processEvent(frameEvent()).captures;
    expect(captures.map((c) => c.label)).toEqual(['00-first']);
    expect(captures[0]?.viewId).toBe(2);
    expect(captures[0]?.documentId).toBe(2);
  });

  it('does not pass the navigation that created a view to its fresh rules', () => {
    const spy = spyRule('spy');

    run([navigated('loader-a'), frameEvent(), withinDocument(page('/b')), frameEvent()], [spy]);

    // One init per view; the navigations that created them are not dispatched.
    expect(spy.seen).toHaveLength(2);
    expect(spy.seen[0]).toEqual(['frame', 'view-exit']);
    expect(spy.seen[1]).toEqual(['frame']);
  });

  it('delivers view-exit to every rule, against the departing view, for both entries', () => {
    const exits: string[] = [];
    const exitSpy: MilestoneRule<null> = {
      id: 'exit-spy',
      init: () => null,
      evaluate: (state, event, { currentView }) => {
        if (event.type === 'view-exit') {
          exits.push(`${currentView.id} ${currentView.url} -> ${event.nextEntry} ${event.nextUrl}`);
        }
        return unchanged(state);
      },
    };

    run(
      [
        navigated('loader-a', page('/')),
        frameEvent(),
        withinDocument(page('/b')),
        navigated('loader-b', page('/elsewhere')),
      ],
      [exitSpy],
    );

    expect(exits).toEqual([
      `1 ${page('/')} -> route ${page('/b')}`,
      `2 ${page('/b')} -> load ${page('/elsewhere')}`,
    ]);
  });

  it("hands each rule its state from the view just left", () => {
    const spy = spyRule('spy');

    run([navigated('loader-a'), frameEvent(), withinDocument(page('/b'))], [spy]);

    expect(spy.previous).toEqual([undefined, ['frame', 'view-exit']]);
  });

  it('keeps the frames seen across a route change, but not across a load', () => {
    const engine = new RulesEngine(defaultDocumentRules);

    engine.processEvent(navigated('loader-a', page('/')));
    engine.processEvent(frameEvent({ scrollY: 40 }));

    engine.processEvent(withinDocument(page('/b')));
    expect(engine.currentState.currentView).toMatchObject({
      firstFrameObserved: true,
      lastFrame: { scrollY: 40 },
    });

    engine.processEvent(navigated('loader-b'));
    expect(engine.currentState.currentView).toMatchObject({
      firstFrameObserved: false,
      lastFrame: null,
    });
  });

  it('evaluates view-exit once and returns what it captured', () => {
    let exitEvaluations = 0;

    const onceOnExit: MilestoneRule<{ done: boolean }> = {
      id: 'once-on-exit',
      init: () => ({ done: false }),
      evaluate: (state, event, { currentView, lastFrame }) => {
        if (event.type !== 'view-exit' || state.done || !lastFrame) {
          return unchanged(state);
        }
        exitEvaluations += 1;
        return {
          nextState: { done: true },
          captures: [
            captureFor(currentView, {
              label: 'exit',
              frame: lastFrame,
              detail: 'exit capture',
            }),
          ],
        };
      },
    };

    const engine = new RulesEngine([onceOnExit]);
    engine.processEvent(navigated('loader-a'));
    engine.processEvent(frameEvent());

    const captures = engine.processEvent(navigated('loader-b')).captures;

    expect(exitEvaluations).toBe(1);
    // Captures from the departing view are returned by the navigation that
    // replaced it, and they carry the departing view's identity.
    expect(captures.map((c) => c.label)).toEqual(['exit']);
    expect(captures[0]?.viewId).toBe(1);
    expect(captures[0]?.loaderId).toBe('loader-a');

    // The incoming view starts from freshly initialized state, so the same
    // rule is armed again rather than staying latched from the previous one.
    expect(engine.currentState.ruleStates['once-on-exit']).toEqual({
      done: false,
    });
  });

  it('rejects duplicate rule ids', () => {
    expect(() => new RulesEngine([spyRule('dup'), spyRule('dup')])).toThrow(
      /Duplicate milestone rule id/,
    );
  });
});

describe('document lifecycle rules', () => {
  it('captures the frame after a milestone, not the milestone itself', () => {
    const captures = run(
      [
        navigated('loader-a'),
        frameEvent(),
        milestone('ready', 'loader-a'),
        frameEvent(),
        milestone('settled', 'loader-a'),
        frameEvent(),
      ],
      defaultDocumentRules,
    );

    expect(captures.map((c) => c.label)).toEqual([
      '00-first',
      '01-domcontentloaded',
      '02-settled',
    ]);
  });

  it('on a page that paints nothing after a milestone, captures the frame showing once the stream goes quiet', () => {
    const captures = run(
      [
        navigated('loader-a'),
        frameEvent({ scrollY: 1 }),
        milestone('ready', 'loader-a'),
        quiet(250),
        milestone('settled', 'loader-a', 600),
        quiet(850),
        // Painted much later: both are already captured.
        frameEvent({ scrollY: 2 }),
      ],
      defaultDocumentRules,
    );

    expect(captures.map((c) => `${c.label} ${c.frame.scrollY}`)).toEqual([
      '00-first 1',
      '01-domcontentloaded 1',
      '02-settled 1',
    ]);
    expect(captures[2]?.detail).toBe(
      'Compositor frame showing once the document is settled; nothing was painted after it',
    );
  });

  it('takes the next frame when one comes before quiet, and captures once', () => {
    const captures = run(
      [
        navigated('loader-a'),
        frameEvent({ scrollY: 1 }),
        milestone('settled', 'loader-a'),
        frameEvent({ scrollY: 2 }),
        quiet(250),
      ],
      defaultDocumentRules,
    );

    expect(captures.map((c) => `${c.label} ${c.frame.scrollY}`)).toEqual([
      '00-first 1',
      '02-settled 2',
    ]);
    expect(captures[1]?.detail).toBe('Compositor frame once the document is settled');
  });

  it('with nothing painted yet when the stream goes quiet, waits for the first frame', () => {
    const captures = run(
      [
        navigated('loader-a'),
        milestone('ready', 'loader-a'),
        quiet(250),
        frameEvent({ scrollY: 1 }),
      ],
      defaultDocumentRules,
    );

    expect(captures.map((c) => `${c.label} ${c.frame.scrollY}`)).toEqual([
      '00-first 1',
      '01-domcontentloaded 1',
    ]);
  });

  it('ignores lifecycle events belonging to another loader', () => {
    const captures = run(
      [
        navigated('loader-a'),
        frameEvent(),
        milestone('ready', 'some-subframe-loader'),
        frameEvent(),
      ],
      defaultDocumentRules,
    );

    expect(captures.map((c) => c.label)).toEqual(['00-first']);
  });

  it('captures the departing frame exactly once on navigation', () => {
    const captures = run(
      [
        navigated('loader-a'),
        frameEvent({ scrollY: 500 }),
        navigated('loader-b'),
        frameEvent(),
      ],
      defaultDocumentRules,
    );

    const farewell = captures.filter(
      (c) => c.label === '99-before-navigation',
    );
    expect(farewell).toHaveLength(1);
    expect(farewell[0]?.documentId).toBe(1);
    expect(farewell[0]?.frame.scrollY).toBe(500);
    expect(farewell[0]?.detail).toContain('next URL is');
  });

  it('captures the final resting state on stop', () => {
    const captures = run(
      [navigated('loader-a'), frameEvent({ scrollY: 120 }), { type: 'stop' }],
      defaultDocumentRules,
    );

    const last = captures.at(-1);
    expect(last?.label).toBe('99-before-navigation');
    expect(last?.frame.scrollY).toBe(120);
    expect(last?.detail).toContain('Session ending');
  });

  it('gives every route its own first frame and farewell, under its own URL', () => {
    const captures = run(
      [
        navigated('loader-a', page('/')),
        frameEvent({ scrollY: 10 }),
        withinDocument(page('/b')),
        frameEvent({ scrollY: 20 }),
        withinDocument(page('/c')),
        frameEvent({ scrollY: 30 }),
        { type: 'stop' },
      ],
      defaultDocumentRules,
    );

    expect(
      captures.map((c) => `${c.viewId} ${c.entry} ${c.url} ${c.label} ${c.frame.scrollY}`),
    ).toEqual([
      `1 load ${page('/')} 00-first 10`,
      `1 load ${page('/')} 99-before-navigation 10`,
      `2 route ${page('/b')} 00-first 20`,
      `2 route ${page('/b')} 99-before-navigation 20`,
      `3 route ${page('/c')} 00-first 30`,
      `3 route ${page('/c')} 99-before-navigation 30`,
    ]);
    expect(captures[1]?.detail).toContain('Route change; next URL is');
    expect(captures.every((c) => c.documentId === 1)).toBe(true);
  });

  it('captures a milestone once per document, even when it arms just before a route change', () => {
    const captures = run(
      [
        navigated('loader-a', page('/')),
        frameEvent(),
        milestone('ready', 'loader-a'),
        withinDocument(page('/b')),
        frameEvent({ scrollY: 7 }),
        frameEvent(),
      ],
      defaultDocumentRules,
    );

    const dcl = captures.filter((c) => c.label === '01-domcontentloaded');
    expect(dcl).toHaveLength(1);
    // The first frame after it, which the new view is showing.
    expect(dcl[0]).toMatchObject({ viewId: 2, url: page('/b'), frame: { scrollY: 7 } });
  });

  it("returns every rule's clip writes in rule order, the departing view's included", () => {
    /** Writes one `drop` per event, its id naming the rule and the event. */
    const writer = (id: string): MilestoneRule<null> => ({
      id,
      init: () => null,
      evaluate: (state, event) => ({
        nextState: state,
        captures: [],
        clipWrites: [{ type: 'drop', id: `${id} ${event.type}` }],
      }),
    });
    const engine = new RulesEngine([writer('a'), writer('b')]);
    const ids = (writes: readonly ClipWrite[]): string[] => writes.map((w) => w.id);

    engine.processEvent(navigated('loader-a'));
    expect(ids(engine.processEvent(frameEvent()).clipWrites)).toEqual(['a frame', 'b frame']);
    // The navigation that replaces the view returns what its view-exit wrote.
    expect(ids(engine.processEvent(navigated('loader-b')).clipWrites)).toEqual([
      'a view-exit',
      'b view-exit',
    ]);
  });

  it('returns no clip writes from rules that have none', () => {
    const engine = new RulesEngine(defaultDocumentRules);
    engine.processEvent(navigated('loader-a'));

    expect(engine.processEvent(frameEvent()).clipWrites).toEqual([]);
  });

  it("moves where the page said it is after the rules ran: they see where it was", () => {
    const seen: (string | null)[] = [];
    const watcher: MilestoneRule<null> = {
      id: 'watcher',
      init: () => null,
      evaluate: (state, event, { currentView }) => {
        seen.push(`${event.type} ${currentView.position ? currentView.position.y : 'unknown'}`);
        return unchanged(state);
      },
    };
    const engine = new RulesEngine([watcher]);
    engine.processEvent(navigated('loader-a'));
    engine.processEvent({ type: 'page-position', x: 0, y: 0, receivedAtMs: 1, pageTimeMs: 1 });
    engine.processEvent({ type: 'page-scroll', ended: false, x: 0, y: 300, receivedAtMs: 2, pageTimeMs: 2 });
    engine.processEvent(frameEvent());

    expect(seen).toEqual(['page-position unknown', 'page-scroll 0', 'frame 300']);
    // A new document starts from not knowing.
    engine.processEvent(navigated('loader-b'));
    expect(engine.currentState.currentView?.position).toBeNull();
  });
});

describe('a new session (session-changed)', () => {
  const sessionChanged = (otherTab: boolean): DomainEvent => ({
    type: 'session-changed',
    otherTab,
    receivedAtMs: 0,
  });

  /** `viewId entry label scrollY` of each capture. */
  const journey = (events: readonly DomainEvent[]): string[] => {
    const engine = new RulesEngine(defaultDocumentRules);
    return events.flatMap((event) =>
      engine
        .processEvent(event)
        .captures.map((c) => `${c.viewId} ${c.entry} ${c.label} ${c.frame.scrollY}`),
    );
  };

  it('on another tab: nothing before its report lands in a view, the view left keeps its own last frame, then a tab view', () => {
    expect(
      journey([
        navigated('loader-a'),
        frameEvent({ scrollY: 100 }),
        sessionChanged(true),
        frameEvent({ scrollY: 999 }), // the new tab painting before it says what it shows
        quiet(),
        navigated('loader-b'),
        frameEvent({ scrollY: 7 }),
        { type: 'stop' },
      ]),
    ).toEqual([
      '1 load 00-first 100',
      '1 load 99-before-navigation 100',
      '2 tab 00-first 7',
      '2 tab 99-before-navigation 7',
    ]);
  });

  it('coming back to the document the current view shows is still a tab view', () => {
    expect(
      journey([
        navigated('loader-a'),
        frameEvent({ scrollY: 10 }),
        sessionChanged(true),
        navigated('loader-a'),
        frameEvent({ scrollY: 20 }),
      ]),
    ).toEqual(['1 load 00-first 10', '1 load 99-before-navigation 10', '2 tab 00-first 20']);
  });

  it('on the same tab, the same document goes on as the same view', () => {
    expect(
      journey([
        navigated('loader-pdf'),
        frameEvent({ scrollY: 30 }),
        sessionChanged(false),
        frameEvent({ scrollY: 999 }),
        navigated('loader-pdf'),
        frameEvent({ scrollY: 40 }),
        { type: 'stop' },
      ]),
    ).toEqual(['1 load 00-first 30', '1 load 99-before-navigation 40']);
  });

  it('on the same tab, a new document is a load', () => {
    expect(
      journey([navigated('loader-a'), frameEvent(), sessionChanged(false), navigated('loader-b'), frameEvent()]),
    ).toEqual(['1 load 00-first 0', '1 load 99-before-navigation 0', '2 load 00-first 0']);
  });

  it('stop while waiting for the report still flushes the resting state', () => {
    expect(
      journey([navigated('loader-a'), frameEvent({ scrollY: 50 }), sessionChanged(true), { type: 'stop' }]),
    ).toEqual(['1 load 00-first 50', '1 load 99-before-navigation 50']);
  });

  it('takes no same-document change for the report it waits for', () => {
    const engine = new RulesEngine(defaultDocumentRules);
    for (const event of [
      navigated('loader-a'),
      sessionChanged(true),
      withinDocument(page('/elsewhere'), 'loader-a'),
    ]) {
      engine.processEvent(event);
    }

    expect(engine.currentState.currentView?.id).toBe(1);
    expect(engine.currentState.sessionChanged).toEqual({ otherTab: true });
  });
});
