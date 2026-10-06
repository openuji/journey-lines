# Remove scroll tracking; write a roadmap for getting it back

## Context

Scroll capture grew into two signal paths (frames and the probe) that race each other. In your session one scroll was recorded twice, and a post-scroll image showed the page *before* the scroll. The code is too large to overview.

This change does two things:
1. Removes scroll tracking end to end.
2. Writes a roadmap to `changes/` that you can refer to later.

Nothing from the roadmap is built now.

## Deliverable 1: remove scroll tracking

After this, the pipeline captures only `00`, `01`, `02`, `10`, `11` and `99`.

**Kept**, because it is frame data, not scroll tracking:
- `CompositorFrame.scrollX/scrollY` and the NDJSON record's `scroll {x, y}`;
- the scale-factor pin in `@openuji/cdp`, without which those offsets read 0;
- the conformance check that frames report offsets, and `wheel()` in `test/browser/input.ts`;
- the panel's auto-follow of the newest row.

| Area | Removed |
|---|---|
| Rule | `packages/rules-interaction/src/scroll.ts`, `scroll-motion.ts`; `ScrollLifecycleRule` from `defaultInteractionRules` and the index |
| Labels | `preScroll`, `postScroll`, `preAutoScroll`, `postAutoScroll` in `rules-interaction/src/episode.ts` |
| Probe | `packages/client/probe/src/browser/install.ts`: every listener except click, plus resting positions, `describeScroller`, `positionOf`, `SCROLL_KEYS`, `isEditable`, `onScrollbar`, `describeViewport`. `SCROLL_INPUT_INTERVAL_MS` goes from `constants.ts` and `index.ts` |
| Core types | `packages/core/src/wire.ts`: actions `scrollinput`/`scrollstart`/`scrollend`, `ScrollInputKind`, `ScrollPosition`, `VIEWPORT_SELECTOR`, payload `scroll`/`input`. `domain.ts`: `InteractionEvent.scroll/input`, `ScrollEpisode`, `MilestoneCapture.scrollEpisode`, `InteractionLogRecord.scrollEpisode`. `engine/src/rule.ts`: `CaptureFields` drops `scrollEpisode` |
| Decoder | `stream-interaction/src/index.ts`: the `scroll` passthrough |
| Sinks | `sinks/src/console.ts`: the scroll line and the scroll colour. `persistence.ts`: `scrollEpisode` |
| CLIs | `apps/recorder/src/cli.ts` help line; the scroll fields in `apps/stream-cli/src/interaction.ts` |
| Extension | `apps/extension/src/lib/journey.ts` kinds `scroll`/`auto-scroll`; their icons in `JourneyRow.tsx` |
| Unit tests | `rules-interaction/test/scroll.test.ts`; scroll helpers in `engine/test/helpers.ts`; the scroll case in `stream-interaction/test/interaction.test.ts`; scroll kinds in `apps/extension/test/journey.test.ts` |
| Browser tests | `test/browser/conformance.ts`: scroll steps in the probe test and the pipeline test, and the two scroll-only tests. `fixture.ts`: the `SPA.pane`. `extension.test.ts`: the HiDPI test keeps its pin and restore checks, and instead of `03`/`04` asserts that a click after a wheel has frames at `scrollY` 600 |
| Readme | The "Scroll" section and rows 03–06; one line saying scroll capture is removed and pointing to the roadmap |

## Deliverable 2: `changes/scroll-rebuild.md`

The roadmap, self-contained:
- **Why scroll was removed:** the race, with the measured traces.
  - A CDP wheel: `scrollend` arrived before the frame showing the scroll, giving a stale `04` and a phantom `05`/`06`.
  - `scrollTo`: a duplicate `05`/`06`.
  - Your FU session: `#09` and `#10` were the same scroll.
  - Smooth PageDown on Puppeteer: no problem.
- **What was kept, and why.**
- **The steps for getting it back:**
  - **S1, page scroll from frames alone:** exact images, no race.
  - **S2, who scrolled:** probe scroll input, decided once when the episode settles.
  - **S3, exact positions and scroll depth:** probe `scrollend` matched to frames by offset.
  - **S4, element scrollers:** approximate frames.

  Each step gets its own plan when you ask for it.

## Verification

- `pnpm typecheck && pnpm test` are green.
- `pnpm test:browser` passes: Puppeteer conformance plus the extension suite.
- This leaves only the kept items listed above:

  ```
  grep -rni scroll packages apps/extension/src apps/recorder apps/stream-cli test
  ```
- `pnpm dev:extension`: record, scroll and click. There are no scroll rows, and click rows still appear.
- Then stop for your review.
