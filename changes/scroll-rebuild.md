# Scroll: why it was removed, and the steps back

Scroll capture was removed on 2026-10-05 (`roadmap-scroll.md`). It comes back in steps, each with its own plan. **S1 was built on 2026-10-06.**

One rule runs through every step: **frames alone choose images.** Since 2026-10-07 the page's own reports decide *when* a scroll starts and ends (see "S1 revised" below), reversing the earlier "the probe never decides when a scroll ends". They still never choose a picture. And a scroll needs a cause the page reports, a person's or the page's own code; without one, the page's reports only say where it is (see "S1 revised again").

## Why scroll was removed

The first version had two signal paths that raced each other:
- **Frames:** each screencast frame carries the page's scroll offset.
- **The probe:** `scrollstart`, `scrollend` and scroll input, reported through `Runtime.bindingCalled`.

These are two separate CDP channels, and nothing orders a DOM event against the frame showing the same moment. The rule ended a scroll on the probe's `scrollend` and took the latest frame as the post-scroll image.

Measured on Chrome for Testing 154:

| Case | What happened |
|---|---|
| CDP wheel (instant) | `scrollend` arrived at page time +389 ms. The frame showing the scroll was swapped at +400 ms. `04` showed the page before the scroll. The late frame then looked like new motion: a phantom `05`/`06`. |
| `scrollTo(0, 800)` (instant) | `05-01`/`06-01` both showed y 0, then a duplicate `05-02`/`06-02`. |
| Your FU session | `#09` and `#10` were the same scroll. |
| PageDown (smooth, about 170 ms) | No problem. `04` was about 0.24 px short, under the threshold. |

The tests missed it. They used `arrayContaining` and checked only the probe's `scrollEpisode`, never the frame.

Also measured through the extension (2026-10-05):
- Frames arrive about 1 ms after their swap.
- A CDP `mouseWheel` returns before the page scrolls. The scrolled frame was swapped about 50 ms after the command.
- A click sent right after the wheel is handled before the scroll.

## What was kept, and why

- **`CompositorFrame.scrollX`/`scrollY` and each record's `scroll {x, y}`.** They are frame data, not scroll tracking, and S1 is built on them.
- **The scale-factor pin in `@openuji/cdp`.** At any device scale factor other than 1, and in full Chrome's new headless mode, frames report offset 0.
- **The conformance check that frames report offsets, and `wheel()` in `test/browser/input.ts`.**
- **The panel's auto-follow of the newest row.**

## S1: page scroll from frames alone (built)

- **Opens** on the first frame whose offset moved at least 1 px from where the page rested. This is measured from the rest position, not the previous frame, so a slow drift adds up.
- **Ends** once the offset stops changing:
  - on a page that stopped painting: the fused stream's `quiet` event, sent once nothing has arrived for 250 ms;
  - on a page that keeps painting: any event that arrives 250 ms after the last motion.
- **Only the offset decides.** A click does not end a scroll.
- **Not recorded if still open** when the view ends (a navigation or Stop): its last frame may already be the next page's. (Originally flushed with `settled: false`; changed on 2026-10-06, see the fix below.)
- **Images are fixed by the offset,** so when the end is noticed never changes them:
  - `03` is the latest frame proven at rest before the move (see the fix below);
  - `04` is the frame where the offset landed.
- **Decided once, at the end.** `03` and `04` are emitted together. A click within 250 ms of the landing is therefore recorded before that scroll's pair.
- **The `04` record carries `scrollEpisode { path }`.** The path has one sample (`frameIndex`, `receivedAtMs`, `x`, `y`) per frame that moved. Distance, direction and speed all derive from it.
- **Scrolls under 8 px of travel are dropped.** Travel is path length, so a scroll down and back counts.
- **Every page scroll is `03`/`04`**, the page's own `scrollTo` included. Frames cannot tell who scrolled.

**Known gap, measured after S1 was built (2026-10-06).** The screencast's offset metadata can lag the pixels. On a page with no main-thread work, Chrome scrolls on the compositor thread, which covers wheel, trackpad and keys, so the person's own scrolls. Saving every frame and comparing pixels with metadata showed:

| Scroll | Metadata vs pixels |
|---|---|
| Instant CDP wheel, still page | Two frames already showed y 600 while still reporting 0 |
| Smooth PageDown, still page | Pixels moved every ~8 ms, but the metadata changed only twice in ~170 ms (0 → 279 → 769) |
| `scrollTo`, still page (main thread) | In sync |
| Wheel on the animated fixture (a commit every frame) | In sync |

The cause is in Chromium (`frame_sink_video_capturer_impl.cc`). The capturer stamps each capture with the offset of the frame that triggered it, then `"Request[s] a copy of the next frame from the frame sink."`, with up to 3 captures in flight (`page_handler.cc`). So a frame's image is never older than its offset, but it can be a few frames newer.

What this meant for S1:
- **`03` was wrong:** it was the last frame before the *metadata* moved, so it could already show the scroll beginning.
- **`path` is sparse.** Still open.
- **`04` is fine,** because the pixels lead the metadata.

**Fixed (2026-10-06): `03` is the page proven at rest** (`rules-interaction/src/rest.ts`). A frame is proven at rest once `QUIET_AFTER_MS` has passed after it with no frame reporting motion: by then the reports have caught up with its image, or nothing was painted at all.
- `03` is the latest frame proven at rest before the motion.
- A scroll in a view's first 250 ms, before anything is proven, is not a scroll: the page is still arriving. (It briefly recorded a lone `04`; never again.)
- The same proof ends a scroll: the scroll is over once its landing frame is proven at rest.

The `/still` browser test compares `03`'s image with the frame on screen before the wheel.

## Fixed: no fake scroll across a page change (2026-10-06)

**The problem.** A page change can put a frame on the wrong side of it:
- **A:** the previous page's last frame arrives after the switch (page loads; SPA routes, 2 of 3), so the next page saw "600 → 0";
- **B:** an SPA's new route is painted before its URL changes, or the route message comes 2–5 ms late, so the previous page saw "2000 → 0".

**The fix, all in the scroll rule:**
- A scroll starts only from a frame of the same page proven at rest. That covers A when the next page draws within 250 ms, and there is never a `04` without its `03`.
- When a new page reports `firstPaint`, tracking starts over from the frame on screen, with its stillness counted from that moment. That covers A on slow page loads. A's late frames always arrived before `firstPaint`: 7/7 on Chrome 156, 6/6 on 154.
- A scroll still open at a page change or Stop is not recorded, which covers B. Every recorded scroll is settled, so `scrollEpisode` is just `{ path }`.

The browser suite checks it for page loads and for both SPA router orders.

**Measured and set aside (Chrome 156, Phase 1 of a "one timeline" plan):** filing events by Chrome's own times instead of arrival order.
- **What works:** the page-time bridge is exact, and it places clicks correctly.
- **Why not pages:** a page change is not an instant for pictures. An animated page A keeps drawing for up to 2.3 ms after B begins. SPA content changes around `pushState`, not at it. Some milestones (`networkAlmostIdle`, `networkIdle`, `firstMeaningfulPaint`) report moments 420–910 ms past.
- **The trust window:** a picture can run up to 108 ms ahead of its reported offset, so it stays at 250 ms.

**Known limit, kept on purpose (2026-10-06):**
- On an animated page, a new page's `00-first` (and sometimes `01`) can show the previous page's or route's last picture.
- **Measured:**
  - page loads: the old page's late pictures always arrive before the new page's `firstPaint` (17/17);
  - routes: Chrome's soft-navigation report also comes after the old route's late pictures, but only an in-page script receives it, and only for a person's click.
- **Not fixed:** every fix needed extra view state, because Chrome reports no paint for a route, for the page showing at attach, or for a page restored by Back. That was too much complexity for one picture.

## S1 revised: timing from the page, pictures from the frames (2026-10-07)

**Why.** You tried `dev:extension` on www.fu-berlin.de after S1, and one gesture was recorded as two scrolls (260 → 312): the FU-session bug again. Measured in the extension host (Chrome 154):
- **Frame offsets stall.** During a trackpad-like flick the offset stamped on frames stayed at 54 for 460 ms while 27 different pictures arrived. The page's own `scroll` events reported 72 … 312 every ~25 ms over the same span.
- **They also never catch up.** After a scroll the offset often stays wrong (3660 shown, page at 4291). So S1's 250 ms "no motion" rule split one gesture into two or three scrolls, and the same cause made the extension record no scroll at all on still pages.
- **The page's reports are continuous:** longest pause 61 ms (181 ms on a page busy with its own JavaScript); page → recorder ≤ 20 ms.
- **`scrollend` fires once per gesture** (touchpad, PageDown, an instant jump; separate wheel events each get one). The landing picture came at most 39 ms after it.
- **The order differs by Chrome.** Headed, the report came 17–50 ms before the first moving picture; in headless-shell the picture came 6–8 ms first.

**What changed (your decisions in bold):**
- **The page's reports decide when:**
  - the probe reports where the page is when it starts, its position at every `scroll`, and its `scrollend`, from the top document only;
  - a scroll starts at the first report and ends once the page has said `scrollend` and reported nothing for 250 ms (your "the same for 240 ms, then changes");
  - **it also ends after 1 s of silence without `scrollend`.**
- **Frames choose every picture.** A picture and its report arrive within 100 ms of each other, either way round (`REPORT_SLACK_MS`):
  - `03` is the newest frame at least 100 ms before the first report;
  - `04` is the newest frame up to 100 ms after the last report, fixed by that report and not by when the end is noticed;
  - the clip is every frame between them.
- Reports in a view's first 250 ms are the page arriving (a router's reset, a restored scroll position), as in S1.
- **Positions come only from the page:**
  - the `04` path is the page's reports;
  - the video trace carries the page's last reported position per frame;
  - **every record's `scroll` is where the page last said it was** (the `03`'s: before the scroll), left out until the page has said.

  Frame offsets stay on `CompositorFrame` as raw data.
- **Removed:** the rest proof (`rest.ts`), the `firstPaint` start-over and offset tracking.

**Checked:**
- The fu-berlin.de repro gives one scroll, twice, with the page's 128 reports.
- A touchpad gesture and a notch spin give one scroll each (browser suite).
- The extension records a scroll on the still fixture page.

**Known limit:** on a busy page, reports can lag (181 ms measured) and a jump can be painted late (912 ms once); its `04` is then the first picture that came.

## S1 revised again: a scroll needs a cause (2026-10-07)

Plan: `~/.claude/plans/scroll-causes.md`.

**Why.** You resized the window in `dev:extension` (default size to full), and it recorded a scroll (1422 → 1459) whose video showed a still page. Chrome moves the page's offset to keep what is on screen in place (scroll anchoring), and reports that as `scroll` events: a maximize on fu-berlin.de sent 42, no `scrollend`, no cause. With no `scrollend`, the 1 s fallback ended it, and the rule recorded it. **Your point: nothing was scrolling, so the fallback must not apply.**

**Measured (extension host, fu-berlin.de, Chrome 154):** every cause tried came before the page's first report.

| Cause | Seen as | Before the first report |
|---|---|---|
| wheel | `wheel` | 0–7 ms |
| touch gesture | `touchstart` | 11 ms |
| PageDown | `keydown` | 9–10 ms |
| `scrollTo` / `scrollBy` / `scrollIntoView` / `scrollTop =` | the call | 0–3 ms; smooth 20 ms |
| `location.hash = …` | `hashchange` | the same moment |
| click on an in-page `#…` link | the click (its `hashchange` comes after the scroll) | 21 ms |

**What changed (your decisions in bold):**
- **A scroll is active from a cause until it ends;** reports without a cause only say where the page is.
  - The probe reports causes (`scroll-cause`) and decides nothing (`client/probe/src/browser/scroll-causes.ts`). Its hooks call the page's originals unchanged and never throw into the page.
  - The scroll rule alone decides: a cause arms it for 250 ms, and the next report opens a scroll. While open, reports extend it as before, and the 1 s fallback now applies only to an open scroll.
- **The cause is a data field, labels stay `03`/`04`:** `scrollEpisode.cause` (`kind`, `detail`), and the `04` detail says it in words. This is part of S2, done.

**Checked (browser suite, headed and headless):**
- A wheel, a touch gesture, PageDown, a link, `scrollTo` and a smooth `scrollIntoView` each give one scroll with its cause.
- Content changing size above the screen is no scroll, and the page's position follows it.
- A window resize that moves the page is no scroll: Puppeteer headed and the extension.

**Limits:** no cause the probe sees, so they are recorded as positions, not as scrolls: find in page, middle-click autoscroll, dragging a selection past the edge, and an overlay scrollbar dragged outside its 16 px strip.

## S1b: a video of each scroll, as a setting

Plan: `~/.claude/plans/ok-plan-s1b-in-validated-anchor.md`.

**Decided (2026-10-07):**
- **The default stays `03`/`04`.** Video is a setting, off by default: `UXR_VIDEO=1` in the CLI, a toggle in the extension. With it on, a scroll gets a `.webm` in addition to `03`/`04`.
- **How a scroll is output is configuration, never an option of the scroll rule.** A shots picker inside the rule (a few screenshots per scroll) was built on 2026-10-06 and removed the next day, together with its package, for that reason and to keep the test surface small.
- **The scroll rule only names the frames.** A separate pure module, `scroll-clip.ts`, reads clip writes (`frame`, `keep`, `drop`) off how the rule's state changed. The rule returns them next to its captures, and `startRecording` delivers them to a `ClipSink`, so `reduce()` stays pure. With no clip sink, a null one (`noClips`) discards them.
- **Why not a frame tap:** only the rule knows the exact range: the frames after `03` that report no motion but may already show it, and the still frames of a pause inside one scroll. A tap would have needed a retention API from the engine.
- **The NDJSON gets a line per video,** with a trace of one sample per video frame: `frameIndex`, time in the video, `x`, `y`. The `04` line keeps `scrollEpisode.path`.
- **Encoder:** libav.js (WebAssembly, VP8 in WebM) in a worker, in Node and in the extension's offscreen document. It is measured before it is built.

**Built (2026-10-07):**
- **Phase A:** shots removed.
- **Phase B:** clip writes.
  - `core/clip.ts` has the types and `noClips`.
  - Engine: `RuleResult.clipWrites`, and `processEvent` returns `{ captures, clipWrites }`.
  - `rules-interaction/src/scroll-clip.ts`. The scroll rule's only changes: `evaluate` appends the writes, and a page change or Stop now clears the open scroll.
  - `startRecording({ clips })` delivers the writes and drains clips before sinks (`drainInStages`).
  - The `/still` browser test checks that each kept clip holds every frame from its `03` to its `04`, by frame index.
- **Phase C (measured):**
  - On a real page's 2 s wheel scroll, only 28 of 114 frames reported a changed offset, which is why the clip looks back over the frames held at rest.
  - libav.js VP8 at full size took 1.4× the scroll's length to encode. You chose half size, and a custom libav.js build with FFmpeg's PNG decoder: 11.5 ms per frame, 0.58× real time, in Node and in an extension worker alike.
  - FFmpeg's PNG decoder keeps state between pictures, so each picture gets a fresh one.
- **Phase D:**
  - `@openuji/clip-webm`, with the vendored build (`build-libav.sh` reproduces it byte for byte) and a timeline that decides every video time on the recorder side.
  - The Node worker (`startClipWorker`), the `.webm` and its NDJSON line with the trace, and `UXR_VIDEO=1`.
  - A browser test decodes the video in Chrome and compares its first and last pictures with the `03` and `04`.
- **Protocol:** encoder words only (`add` / `finish` / `abort`); `clipSinkOver` is the one place the domain's `ClipWrite` meets them.
- **Phase E, the extension:**
  - A panel switch before Record, off by default.
  - An offscreen document starts the encoder's worker; the service worker reaches it over a `BroadcastChannel` (measured 4× cheaper per frame than a relayed `chrome.runtime` port).
  - "Play video" on the `04` row.
  - Pitfall: WXT sets `'wasm-unsafe-eval'` only in dev, so a production build silently fell back to libav's missing asm.js. The manifest now sets the CSP.
  - Pitfall: in `dev:extension`, WXT serves a page's scripts from its dev server (`localhost:3000`), and Chrome refuses a worker from another origin than the page. So the encoder worker is its own unlisted script, `/clip-worker.js`, built into the extension in dev and production alike. A failure to start now rejects Record, with a 15 s limit, instead of hanging.

**Found while building Phase E (2026-10-07):** in the extension host, a still page's scroll is never reported in the screencast's offsets. It is fixed by "S1 revised" above: scrolls are timed by the page, and the extension's tests use the still page again.

## S1c: `quiet` for `01`/`02`

`02-settled` arms on `networkAlmostIdle` and then waits for a next frame that, on a still page, never comes. It could take the frame showing at `quiet` instead. The same applies to `01-domcontentloaded`, since both use one rule factory. Post-click keeps waiting for its next frame on purpose: a click's response often paints after a pause.

## S2: who scrolled

**Done with "a scroll needs a cause" (2026-10-07):** the cause is a data field, `scrollEpisode.cause`. The earlier `05`/`06` labels for programmatic scrolls are dropped: **your decision, labels stay `03`/`04`.**

What remains:
- The causes in the limits above, if they matter.
- **Measured on 2026-10-05:** by the time the `wheel` DOM event fires, an element has already moved. That matters for S4: note an element's resting position on `pointerover`, `touchstart` or the scroll key's `keydown`.
- **The probe runs before `document.documentElement` exists.** One exception there silently stopped all its reporting.

## S3: scroll depth

The page's exact positions are in since "S1 revised": the `04` path, every record's `scroll`, the video trace. What remains is scroll depth: the furthest the page has been in a view, derivable from the paths and positions, so it may not need a field of its own.

## S4: elements with their own scrollbar

The probe reports the top document's scrolling only. An element's own `scroll`/`scrollend` can be reported the same way, timed by the page as the page's own are, with the scroller as a data field: page and element scroll stay one concept.
