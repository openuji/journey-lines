# Simplify the journey log in two sequential stages

## Summary

The split is sound: establish and validate the event model first, then build richer media rendering on that model. Stage 1 produces a working, simpler log and a reviewable architectural checkpoint. Stage 2 adds ranges and previews without redefining event grouping.

## Stage 1 — JourneyEvent projection and basic integration

- Introduce a pure `journeyEvents(captures, startedAtMs, clips)` projection in a separate extension-local module.
- Define a readonly `JourneyEvent` union for page arrival, click, scroll, and departure. Include stable identity, view, timestamp, URL, relevant screenshot frames, and optional clip.
- Interpret internal labels and the existing session-ending marker exclusively inside this projection. Renderers receive explicit event fields rather than raw captures to classify.
- Consolidate loading milestones into one arrival event. Prefer settled → ready → first screenshot; retain the original arrival timestamp and identity as it updates.
- Pair click/scroll endpoints by view, interaction kind, and episode. Attach late clips to the same event. Preserve incomplete events without inventing frames.
- Group by first-seen view: arrival first, interactions in first-capture arrival order, departure last. Late captures update their original view.
- Compute the projection once at the side-panel presentation boundary. Pass the same events to the list and completed summary.
- Replace capture rows with a minimal event renderer: plain labels, single-line arrival URL, screenshot thumbnails, existing screenshot expansion, and existing video playback.
- Use **Page loaded**, **Page changed** for navigation within an app without reloading, **Switched tab**, **Click**, **Scroll**, **Left page**, and **Recording ended**. Omit target descriptions and diagnostic paragraphs.
- Show Before/After thumbnails for interactions, initially without a scrubber. Replace **Captures** with **Events**.

**Checkpoint:** Test consolidation, pairing, stable identity, ordering, late updates, missing endpoints, navigation-spanning clicks, stop wording, and event counts. Verify the simplified live/completed log and keep report tests passing. Complete extension type checking and build before Stage 2.

## Stage 2 — Media ranges and rendering refinement

- Keep Stage 1’s projection and event semantics as the source of truth. Components handle presentation and transient interaction state only.
- Place interaction media below the heading: visible Before/After thumbnails with a horizontal range between them.
- With a clip, hovering shows a floating preview above the range. Map pointer position to clip time and select the recorded frame at or immediately before that time using `clip.trace`.
- Keep endpoint thumbnails fixed. Retain screenshot expansion and a compact Play control for full playback within the same entry.
- Without a clip, show a passive connector. Missing endpoints retain an unavailable placeholder.
- Support keyboard frame stepping, Home/End, and Escape. Keep previews within viewport bounds and outside the scrolling container to prevent clipping.
- Load preview media on demand, coalesce seeks, and release resources when dismissed. Preserve live-follow behavior without scrolling during preview.

**Checkpoint:** Test hover/keyboard scrubbing with distinct recorded frames, playback, expansion, and resource cleanup. Review narrow/wide panels and preview placement near viewport edges. Run affected browser tests, type checking, and build.

## Architectural boundaries and execution order

- Finish, validate, and report Stage 1 before implementing Stage 2; keep their changes independently reviewable.
- Any required change to the established event contract during Stage 2 must be explained explicitly.
- Keep the report’s existing row builder and rendering unchanged.
- Preserve recording rules, transport messages, stored artifacts, exports, and public core types. No migration or additional persisted event state.
- One interaction event represents one existing capture episode; detection semantics remain unchanged.
