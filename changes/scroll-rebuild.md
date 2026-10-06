# Scroll: why it was removed, and the steps back

Scroll capture was removed on 2026-10-05 (`roadmap-scroll.md`). It comes back in steps, each with its own plan. **S1 was built on 2026-10-06.**

One rule runs through every step: **frames alone choose images.** The in-page probe may add data to a scroll (who scrolled, exact positions), but it never decides which frame is captured or when a scroll ends.

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
- **Flushed with `settled: false`** when the view ends first (a navigation or Stop), because no later frame of the view will come.
- **Images are fixed by the offset,** so when the end is noticed never changes them:
  - `03` is the last frame at rest before the move;
  - `04` is the frame where the offset landed.
- **Decided once, at the end.** `03` and `04` are emitted together. A click within 250 ms of the landing is therefore recorded before that scroll's pair.
- **The `04` record carries `scrollEpisode { settled, path }`.** The path has one sample (`frameIndex`, `receivedAtMs`, `x`, `y`) per frame that moved. Distance, direction and speed all derive from it.
- **Scrolls under 8 px of travel are dropped.** Travel is path length, so a scroll down and back counts.
- **Every page scroll is `03`/`04`**, the page's own `scrollTo` included. Frames cannot tell who scrolled.

**Known gap, measured after S1 was built (2026-10-06).** The screencast's offset metadata can lag the pixels. On a page with no main-thread work, Chrome scrolls on the compositor thread, which covers wheel, trackpad and keys, so the person's own scrolls. Saving every frame and comparing pixels with metadata showed:

| Scroll | Metadata vs pixels |
|---|---|
| Instant CDP wheel, still page | Two frames already showed y 600 while still reporting 0 |
| Smooth PageDown, still page | Pixels moved every ~8 ms, but the metadata changed only twice in ~170 ms (0 → 279 → 769) |
| `scrollTo`, still page (main thread) | In sync |
| Wheel on the animated fixture (a commit every frame) | In sync |

What this means for S1:
- **`03` can be wrong:** it is the last frame before the *metadata* moved, so it can already show the scroll beginning.
- **`path` is sparse.**
- **`04` is fine,** because the pixels lead the metadata.

How to pick an exact `03` is open. Options to weigh:
- take the frame from before the burst that carried the motion;
- compare pixels;
- make the page commit every frame while recording, which is invasive.

## Next: frames belong to their view (engine)

**Found while building S1 (2026-10-06):** the departing page's last frame can arrive 3–6 ms after `Page.frameNavigated`, still at the old offset. The engine assigns frames by arrival, so that frame lands in the next view. It happened in most navigations away from the fixture's animated page.

Two effects:
- **A phantom scroll:** the next view records a scroll from the old offset to 0, with the old page as its "before" image.
- **A wrong `00-first`:** the next view's `00-first` shows the old page. This bug predates S1.

The S1 browser test checks scrolls per view until this is fixed.

The only signal CDP offers is the new document's `firstPaint`. In 6 of 6 navigations it arrived 2–3 ms after that document's first frame. The design to plan:
- After a document navigation, frames are held back from the new view until its document reports `firstPaint`.
- The latest held frame becomes the view's first frame. Earlier ones belonged to the departing page.

Measure first:
- back/forward cache restores, which may not report `firstPaint`;
- error pages;
- whether `firstPaint` ever arrives before its frame.

## S1b: frame outputs as modules

You want each scroll to be keepable as 2 screenshots (today), a few screenshots, or a video, each output its own package. The path's frame indices give each scroll's exact frame range.
- **A few screenshots:** can be a bounded selector inside the engine, for example one frame per viewport height travelled.
- **Video:** needs every frame of the scroll. That means frames outside the pure engine: a frame tap next to the sinks, plus an encoder that depends on the host. It needs its own design.

## S1c: `quiet` for `01`/`02`

`02-settled` arms on `networkAlmostIdle` and then waits for a next frame that, on a still page, never comes. It could take the frame showing at `quiet` instead. The same applies to `01-domcontentloaded`, since both use one rule factory. Post-click keeps waiting for its next frame on purpose: a click's response often paints after a pause.

## S2: who scrolled

Probe scroll input (wheel, touch, keys, scrollbar) is attached to a scroll that frames already opened and ended. It is decided once, at the end, and never picks a frame.
- **Earlier decision:** programmatic scrolls get their own labels `05`/`06`. Revisit whether origin should be a data field instead.
- **Measured on 2026-10-05:** by the time the `wheel` DOM event fires, an element has already moved. Note resting positions on `pointerover`, `touchstart` or the scroll key's `keydown`.
- **The probe runs before `document.documentElement` exists.** One exception there silently stopped all its reporting.

## S3: exact positions and scroll depth

The probe's positions, and `maxY` for scroll depth, are matched to frames **by offset, not by which event arrived first**. A late or early probe event can then change a field, never an image.

## S4: elements with their own scrollbar

Frames carry only the page's offset, so an element's scroll does not show in them. Its images can only be approximate: the frames on either side of the probe's `scrollstart`/`scrollend`. Page and element scroll stay one concept, with the scroller as a data field.
