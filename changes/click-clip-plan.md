# Click clips: a video of each click, from its `10` to its `11`

**Historical plan (2026-10-08).** The click-confirmation requirement, overlapping
clips, and overshoot-drop behavior are superseded by the implemented
[split-by-press change](click-clip-fixes-plan.md) of 2026-10-09.

## Context

The click rule (`packages/rules-interaction/src/click.ts`, uncommitted, built 2026-10-08) follows a click the way the scroll rule follows a scroll:
- **Cause:** the press, a primary `pointerdown` or an Enter/Space `keydown`, reported by the probe with a `pressId`: a random token per document and frame, plus a count. The `click` names its press.
- **Frames:** placed by draw time on Chrome's clock where known (Chrome 156), else by arrival.
- **Rest:** 250 ms with no frame or click, or a 2 s cap, "still changing".
- **Pictures:** `10` = newest frame drawn before the press; `11` = the screen at rest. Quick clicks share one response: each click its own `10`, all the same `11`.

Scrolls already have an optional video, `03` → `04`. `scroll-clip.ts` derives clip writes from the scroll rule's state, the rule returns them as data, and the host's clip sink encodes them when video is on. Clicks get the same.

**User decisions (2026-10-08):**
1. **Every click gets its own clip,** from its own `10` to its `11`. In a quick series the clips overlap and end on the shared `11`.
2. **One video setting** for scroll and click clips (`UXR_VIDEO=1`, the panel switch); only its wording changes.
3. **A press that never becomes a click** (a drag, a text selection, flatpickr's day pick, Space scrolling) is ended by the page itself: the probe reports it. No timer.

**Downstream needs nothing new; it is generic today:**
- the timeline (first frame at 0, lead-in capped at 250 ms, real spacing, 250 ms end hold);
- the encoder, one per clip id, so parallel clips work;
- `nav-<view>-<label>.webm` next to the capture with the same label;
- the panel's "Play video" on the row with the clip's `viewId` and `label`.

## Principles this plan holds to

- **One owner per decision:**
  - the probe decides when a press ended, since the order of DOM events is exact there;
  - the rule decides what a click's `10` and `11` are;
  - `click-clip.ts` only reads the rule's state change and turns it into writes, as `scroll-clip.ts` does. It decides nothing about clicking: a clip is **kept exactly when its click has an `11` capture**, otherwise dropped.
- **No new rule state for output's sake.** The rule gains one detection fact, the press's lifecycle, which it uses itself.
- **Rules stay pure,** writes are data, output is the host's choice (`noClips` default).
- **Linear code:** a set difference with three cases, no special cases.
- **Remove the TEMP DEBUG code** in `click.ts` (`debugResponse`, and `console.log('clickEpisodeRule OPTIONS', …)`).

## Design

### 1. The probe ends a press that got no click

In `packages/client/probe/src/browser/clicks.ts`:
- **The pending press remembers how it ends:** `{ id, by: 'pointer' }` or `{ id, by: key }`.
  - `pointerup`/`pointercancel` end only a pointer press, and the `keyup` of its own key ends only a key press.
  - Today any `keyup` or `pointerup` clears it; this tightens that.
- **The `click` handler records the id it named.**
- **After the ending task** (`setTimeout(0)`, as today), the press is no longer pending, and if no click named it, the probe reports `{ action: 'press-ended', pressId, pageTimeMs }`. The browser dispatches a press's `click` in the task that releases it, so by then it would have come.

Wire, domain and decoding:

| Where | What |
| --- | --- |
| `core/wire.ts` | `PressEndedWirePayload`, added to `ProbeWirePayload` |
| `core/domain.ts` | `PressEndedEvent { type: 'press-ended'; pressId; receivedAtMs; pageTimeMs }`, added to `DocumentEvent`; doc: "a press that ended without a click" |
| `stream-probe` | decoder in `decode.ts`; `index.ts` lets it through from any frame (`FROM_ANY_FRAME`) |
| `apps/stream-cli/src/probe.ts` | a print branch |

### 2. The rule: a press's lifecycle, instead of `claimed`

In `click.ts`:
- `Press.claimed: boolean` becomes `Press.state: 'down' | 'clicked' | 'ended'`.
  - `clicked`: a click named it; `ended`: a `press-ended` named it.
- `restingFrame` keeps its meaning ("a later press that is not part of this response") with `state !== 'clicked'`.
- `OpenClick` keeps the cause's press id: `pressId?: string`.
- `end()` for "stopped" and "left for another tab" also sets `press: null`: everything going ends there, including a press that's still down.
  - At stop it would otherwise never close.
  - On a tab switch, `init` resets the state *between* events, so a diff could not see it end.
- **Wiring,** as `scroll.ts` does: `evaluate` returns `{ ...result, clipWrites: clickClipWrites(id, state, result, ctx.currentFrame, ctx.currentView.position) }`.

### 3. `click-clip.ts`: a pure diff, like `scroll-clip.ts`

**The clips going in a state `S`:**
- each open click with a cause: id `` `${ruleId}-${pressId}` ``, or `` `${ruleId}-v${view.id}-c${episode}` `` for a click the page's own code made (no press);
- `S.press` while `state === 'down'`: id `` `${ruleId}-${pressId}` ``.

A click that claims its press keeps the same id, so its clip goes on. `pressId` is unique per document and frame, and view ids per recording; frame `index` isn't usable, since it restarts on every compositor attach. A trusted click with no press reported has no `10`, so no clip.

**`clickClipWrites(ruleId, before, after, frame, position)`** returns writes in this order:
1. **Ended:** going in `before`, not in `after`.
   - `keep` with the click's `11`: the capture in `after.captures` with `viewId === click.view.id` and label `episodeLabel(InteractionLabel.postClick, click.episode)`.
   - Otherwise `drop`. That covers a press that never became a click, stop, and another tab.
2. **Began:** going in `after`, not in `before`.
   - Write the cause's `before` frame (if any).
   - Then the frames after it in `before.seen`, **by position** (arrival order), not by `index`: response frames that arrived before the press's report (flatpickr).
3. **Going on:** in both, and this event carries a frame: write it to each.

`position` is `ctx.currentView.position`, as for scroll.

### Known limits (documented, not worked around)

- **A frame drawn before the press that arrives after its report** is written after the start, so the clip can begin one frame before its `10`.
- **A press without a click during an open response:** the `11` is the screen before it, but frames after it were already written, so the clip can run past its `11`.
- **Two clicks naming one press** (a `<label>` forwarding its click): one clip id, so only the first click's `keep` counts.
- **A click where nothing changed** still gets a short still clip, because the rule gave it an `11`. If that's unwanted, it is the rule's call, not the clip's.
- **Touch (untested):** a tap's `click` may come in a later task than its release, which would leave it unpaired: an existing click-rule limit.

## Steps

1. **Probe and wire:** `clicks.ts`; `core/wire.ts`; `core/domain.ts`; `stream-probe` `decode.ts` and `index.ts`; `apps/stream-cli/src/probe.ts`. Then `pnpm build:probe`.
2. **`click.ts`:**
   - `Press.state` replaces `claimed`;
   - handle `press-ended`;
   - `OpenClick.pressId`;
   - `end()` clears `press` when stopped or leaving for another tab;
   - wire `clipWrites`;
   - remove the TEMP DEBUG code;
   - export `OpenClick` for `click-clip.ts`.
3. **New `packages/rules-interaction/src/click-clip.ts`:** `clickClipWrites`, plus a local `going(ruleId, state): Map<id, cause frame>`.
4. **Wording,** since clips are no longer only a scroll's. Find them with `grep -rn "each scroll\|a scroll's\|Today the span"`:
   - `core/clip.ts:4` and the `ClipLogRecord` doc in `domain.ts`;
   - `clip-webm` `protocol.ts:6` and `timeline.ts` comments;
   - `cli-kit/src/index.ts:25`;
   - `apps/recorder/src/session.ts:32,54`, and the `cli.ts` help lines;
   - the extension:
     - `sidepanel/Idle.tsx:13,41` (label "Video of each scroll and click");
     - `lib/protocol.ts:50`;
     - `lib/journey.ts:22`;
     - `lib/recorder.ts:28`;
     - `entrypoints/background.ts:100`;
   - Readme: the `UXR_VIDEO` line, the artifacts table (`nav-00001-11-post-click-01.webm`), Architecture, the extension switch, and in Clicks a "video" bullet plus the known limits above.

## Tests

**Unit: new `packages/rules-interaction/test/click-clip.test.ts`**, built like `scroll-clip.test.ts`: `script()` gives `shown`, `writes` (from `processEvent(e).clipWrites`) and `read` (`frame <name>`, `keep <label>`, `drop`). Helpers come from `packages/engine/test/helpers.ts`, plus a new `pressEnded(pressId, receivedAtMs)`. Cases:
- **One click:** `frame before, frame …, keep 11-post-click-01`.
- **A picture before the press's report (flatpickr):** written right after the start.
- **Three quick clicks:** three clips. Each starts at its own `10`; they overlap; each is `keep` with its own `11-post-click-0N`.
- **A press that got no click:** its clip begins at the press and is dropped at `press-ended`.
- **Stop before rest, and a tab switch:** every clip going is dropped, a still-down press's included.
- **The page's own click:** begins at the click, with an id from view and episode.
- **A trusted click with no press:** no writes.
- **A route change during the response:** `keep` with the `11` filed under the old view.
- **Frames after rest:** not written.
- **Two views:** ids differ.
- **Same-tab re-attach** (frame indices restart): early frames still found by position.

**Unit, elsewhere:**
- `click.test.ts`: the 19 cases unchanged; add that `press-ended` changes no capture, and that a click can't pair with an ended press.
- `stream-probe/test/probe.test.ts`: decode `press-ended`, reject a malformed one, take it from any frame. `packages/cdp/test/events.ts` gets `pressEndedPayload`.
- `apps/extension/test/recorder.test.ts` (video): a click gives `frame…, keep` and a clip `1 11-post-click-01`.

**Browser:**
- `test/browser/fixture.ts`, `/calendar`: add `#vanish`, which hides itself on `pointerdown` as flatpickr's day does. On the FU page that measured no `click`; if Chrome does fire one here, say so in the test and use a `draggable` element instead.
- `test/browser/conformance.ts`:
  - The probe test: after a click, no `press-ended` for its press. A press on `#vanish` gives `press-ended` and no click.
  - The quick-click `/calendar` test: `MemoryClips.kept()` gives three clips, each from its own `10` frame to the shared `11` frame.
- `test/browser/puppeteer.test.ts`, "click video (UXR_VIDEO)", built like the scroll video test, on `/calendar` with one click held 80 ms:
  - one clip `11-post-click-01`;
  - trace first `frameIndex` = the `10`'s frame and last = the `11`'s;
  - `similarity()` above 20 for the first picture against the `10` and the last against the `11`.

## Handoff notes for the implementer

- **Don't commit or push; the user does.** This builds on the uncommitted click-rule work.
- **Read first:**
  - `scroll-clip.ts` and its test: the pattern;
  - `click.ts`: the state being diffed;
  - `core/clip.ts`: the writes;
  - `changes/what-they-see.md` Part 4: how clicks were validated.
- **Builds:**
  - `pnpm build:probe` regenerates the gitignored probe source (it runs in `pnpm build`/`test`/`test:browser`).
  - `startClipWorker` runs `packages/sinks/dist/clip-worker.js`, so build before browser tests.
- **Chrome:**
  - CfT 156 is at `~/.cache/puppeteer/chrome/mac_arm-156.0.8078.4/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`.
  - The pinned Chrome is 154: no `drawnAtMs`, clicks "placed by arrival", still correct.
- **Pitfalls:**
  - Never take a `Page.captureScreenshot` of the recorded tab during a recording: it changes the screencast's frame size.
  - Headed windows must be in front (`Page.bringToFront`) or Chrome stops producing frames.
- **Style:** read and comment like `scroll-clip.ts`: plain words, the why.
- **Separate finding, not in scope:** `scroll-clip.ts` picks its early frames by `index` (`f.index > now.start.index`), which the same-tab re-attach breaks too. Tell the user; don't change it here.

## Verification

- `pnpm test`, `pnpm typecheck`.
- `pnpm test:browser` on the pinned Chrome 154, and with `UXR_CHROME_EXECUTABLE` set to CfT 156.
- **Manual, FU calendar:**
  ```
  UXR_VIDEO=1 UXR_CHROME_EXECUTABLE=<CfT 156> pnpm start https://raumbuchung.ub.fu-berlin.de/lernort/load.php
  ```
  Open the calendar, next ×2 slowly, ×3 quickly, then previous, then pick a day.
  - A `.webm` next to every `11`, starting on its `10` picture and ending on its `11`.
  - The quick three overlap and end on the same month.
  - The day pick gives no clip and no capture (F1).
- Record the results in `changes/what-they-see.md`, "Part 5 — click clips": failures apart from accepted limits.
