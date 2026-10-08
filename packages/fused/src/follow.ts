import type { SessionEnd } from '@openuji/cdp';

/**
 * Which tab a recording follows, as a pure function: `follow(state, event)`
 * returns the next state and the effects to perform. No I/O and no promises
 * in here; `recordActiveTab` performs the effects and reports their outcomes
 * back as events. So every rule is one case below, decided against the state
 * at the moment its event arrives.
 *
 * A session is a debugger connection to one tab; the sources are what record,
 * and they sit on at most one session: the active tab's. A tab keeps its
 * session until Stop or until it ends, so switching back only moves the
 * sources, and no tab is ever attached twice. Nothing waits for an attach.
 */

/** What the recording does with the active tab. */
export type ActiveTabState =
  /** Its session, or the sources, are on the way. */
  | 'attaching'
  /** The sources are on its live session. */
  | 'recording'
  /** The host, or its session, would not let it be recorded; paused until the host reports it again. */
  | 'refused';

/** What the recording does with the active tab, and whether following ended. */
export type FollowStatus<Tab> = Readonly<{
  active: Readonly<{ tab: Tab; state: ActiveTabState }>;
  /** Set once following ended on its own: the window or browser is `gone`, or `revoked`. Call `stop()`. */
  ended: 'gone' | 'revoked' | null;
}>;

export type FollowState<Tab, Session> = Readonly<{
  /** The tab the host last reported. */
  active: Tab;
  /** One live session per tab recorded so far. */
  sessions: ReadonlyMap<Tab, Session>;
  /** Tabs whose attach is on its way: at most one per tab. */
  attaching: ReadonlySet<Tab>;
  /** The tab the sources are on, `settled` once their move there resolved. Null: nothing is recorded. */
  sources: Readonly<{ tab: Tab; settled: boolean }> | null;
  /** Moves so far; the last one is the only one whose outcome counts. */
  moves: number;
  /** Where the sources last went, which decides whether a move is to another tab. */
  lastTab: Tab;
  /** The active tab, refused by the host or by its session, until the host reports it again. */
  refused: Tab | null;
  /** Following is over: ended on its own, or stopped. */
  ended: 'gone' | 'revoked' | 'stopped' | null;
}>;

/** What happened: the host's reports, and the outcomes of the effects. */
export type FollowEvent<Tab, Session> =
  | Readonly<{ type: 'active'; tab: Tab }>
  | Readonly<{ type: 'attached'; tab: Tab; session: Session }>
  | Readonly<{ type: 'attach-failed'; tab: Tab }>
  | Readonly<{ type: 'moved'; move: number }>
  | Readonly<{ type: 'move-failed'; tab: Tab; session: Session }>
  | Readonly<{ type: 'session-ended'; tab: Tab; session: Session; end: SessionEnd }>
  | Readonly<{ type: 'gone' }>
  | Readonly<{ type: 'stop' }>;

/** What to do. Each outcome comes back as an event. */
export type FollowEffect<Tab, Session> =
  /** Then `attached` or `attach-failed`. */
  | Readonly<{ type: 'attach'; tab: Tab }>
  /** Put the sources on `session`; then `moved` or `move-failed`. */
  | Readonly<{ type: 'move'; tab: Tab; session: Session; otherTab: boolean; move: number }>
  /** Take the sources off: nothing is recorded. */
  | Readonly<{ type: 'release' }>
  /** Hand the tab back. */
  | Readonly<{ type: 'close'; session: Session }>;

export interface FollowResult<Tab, Session> {
  readonly state: FollowState<Tab, Session>;
  readonly effects: readonly FollowEffect<Tab, Session>[];
}

/** Recording `tab` over `session`, its sources already on it. */
export function initialFollowState<Tab, Session>(tab: Tab, session: Session): FollowState<Tab, Session> {
  return {
    active: tab,
    sessions: new Map([[tab, session]]),
    attaching: new Set(),
    sources: { tab, settled: true },
    moves: 0,
    lastTab: tab,
    refused: null,
    ended: null,
  };
}

export function follow<Tab, Session>(
  state: FollowState<Tab, Session>,
  event: FollowEvent<Tab, Session>,
): FollowResult<Tab, Session> {
  if (state.ended) {
    // Following is over: a session that lands now is handed back at once.
    if (event.type !== 'attached') return { state, effects: [] };
    const attaching = without(state.attaching, event.tab);
    return { state: { ...state, attaching }, effects: [{ type: 'close', session: event.session }] };
  }

  switch (event.type) {
    case 'active':
      return activate(state, event.tab);

    case 'attached': {
      const { tab, session } = event;
      const attaching = without(state.attaching, tab);
      if (tab !== state.active) {
        // Obsolete: you left the tab while its attach was on the way.
        return { state: { ...state, attaching }, effects: [{ type: 'close', session }] };
      }
      return moveTo({ ...state, attaching, sessions: withEntry(state.sessions, tab, session) }, tab, session);
    }

    case 'attach-failed': {
      const { tab } = event;
      const attaching = without(state.attaching, tab);
      return { state: { ...state, attaching, refused: tab === state.active ? tab : state.refused }, effects: [] };
    }

    case 'moved':
      if (!state.sources || event.move !== state.moves) return { state, effects: [] }; // overtaken
      return { state: { ...state, sources: { ...state.sources, settled: true } }, effects: [] };

    case 'move-failed': {
      const { tab, session } = event;
      if (state.sessions.get(tab) !== session) return { state, effects: [] }; // ended meanwhile
      // Still alive, yet the sources would not go on: it can't be recorded.
      const sessions = withoutEntry(state.sessions, tab);
      const close: FollowEffect<Tab, Session> = { type: 'close', session };
      if (state.sources?.tab !== tab) return { state: { ...state, sessions }, effects: [close] };
      return {
        state: { ...state, sessions, sources: null, refused: tab },
        effects: [close, { type: 'release' }],
      };
    }

    case 'session-ended': {
      const { tab, session, end } = event;
      if (state.sessions.get(tab) !== session) return { state, effects: [] }; // already handed back
      const sessions = withoutEntry(state.sessions, tab);
      if (end === 'revoked') return { state: { ...state, sessions, ended: 'revoked' }, effects: [] };
      if (state.sources?.tab !== tab) return { state: { ...state, sessions }, effects: [] }; // a tab left behind

      // A PDF: the same tab again. A closed tab: the next one, once the host says which.
      const next = activate({ ...state, sessions, sources: null }, state.active);
      return { state: next.state, effects: [{ type: 'release' }, ...next.effects] };
    }

    case 'gone':
      return { state: { ...state, ended: 'gone' }, effects: [] };

    case 'stop':
      return { state: { ...state, ended: 'stopped' }, effects: [] };
  }
}

/** The status the app is told: derived from the state, never chosen at a call site. */
export function statusOf<Tab>(state: FollowState<Tab, unknown>): FollowStatus<Tab> {
  const { active, sources, refused, ended } = state;
  const activeState: ActiveTabState =
    sources?.tab === active && sources.settled
      ? 'recording'
      : refused === active
        ? 'refused'
        : 'attaching';
  return { active: { tab: active, state: activeState }, ended: ended === 'stopped' ? null : ended };
}

/** `tab` is active: record it, or start on the way there. Never waits. */
function activate<Tab, Session>(state: FollowState<Tab, Session>, tab: Tab): FollowResult<Tab, Session> {
  if (state.sources?.tab === tab) return { state: { ...state, active: tab }, effects: [] };
  // Reported again: worth another try.
  const reported = { ...state, active: tab, refused: null };

  const session = state.sessions.get(tab);
  if (session !== undefined) return moveTo(reported, tab, session);

  // Nothing is recorded until its session lands.
  const effects: FollowEffect<Tab, Session>[] = state.sources ? [{ type: 'release' }] : [];
  const released = { ...reported, sources: null };
  if (state.attaching.has(tab)) return { state: released, effects };
  return {
    state: { ...released, attaching: new Set([...state.attaching, tab]) },
    effects: [...effects, { type: 'attach', tab }],
  };
}

/** The sources go onto `session`; the old ones come off as part of the move. */
function moveTo<Tab, Session>(
  state: FollowState<Tab, Session>,
  tab: Tab,
  session: Session,
): FollowResult<Tab, Session> {
  const move = state.moves + 1;
  return {
    state: { ...state, sources: { tab, settled: false }, moves: move, lastTab: tab },
    effects: [{ type: 'move', tab, session, otherTab: tab !== state.lastTab, move }],
  };
}

function without<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set);
  next.delete(value);
  return next;
}

function withEntry<K, V>(map: ReadonlyMap<K, V>, key: K, value: V): ReadonlyMap<K, V> {
  return new Map(map).set(key, value);
}

function withoutEntry<K, V>(map: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V> {
  const next = new Map(map);
  next.delete(key);
  return next;
}
