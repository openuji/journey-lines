# Chromium Watch (UXR Interaction & Visual Stream Capture)

Captures what a user actually saw and did: Chrome compositor frames, navigation
lifecycle milestones, and in-page DOM interactions — fused into one ordered
event stream, reduced by a pure rules engine into PNG screenshots and an NDJSON
log.

---

## Quick Start

```bash
pnpm install
pnpm start https://my.fu-berlin.de/
```

Interact with the page, then press Ctrl+C. Artifacts land in
`recordings/session-<timestamp>/`.

Captures are grouped by **view**: one step of the user's journey. A page load
starts a view, and so does an SPA route change. `nav-00001` is the first view,
`nav-00002` the next, whichever way it began.

| Artifact | Meaning |
| --- | --- |
| `interactions.ndjson` | One record per capture: screenshot path, view, URL showing, the frame's scroll offset, DOM target |
| `nav-00001-00-first.png` | First compositor paint of the view |
| `nav-00001-01-domcontentloaded.png` | Frame following `DOMContentLoaded` |
| `nav-00001-02-settled.png` | Frame following `networkAlmostIdle` |
| `nav-00001-10-pre-click-01.png` | Visual state immediately before click 1 (+ DOM target) |
| `nav-00001-11-post-click-01.png` | Compositor response to click 1 (+ DOM target) |
| `nav-00001-99-before-navigation.png` | Final visible frame before navigating away or ending |

Set `UXR_HEADLESS=1` to run without a visible browser window.

---

## Architecture

```
[ Host ] ──► CdpTransport ──┬─► [ 1. Compositor  ] ──┐
 Puppeteer today;           ├─► [ 2. Lifecycle   ] ──┼──► [ Fused Stream ] ──► [ Rules Engine ] ──► [ Sinks ]
 extension, Electron next   └─► [ 3. Interaction ] ──┘      (one FIFO)         (pure reducer)     (console,
                                                                                                 persistence)
```

The app exists to bring **three independent asynchronous streams** together.
Everything right of the host is runtime-agnostic: it sees only a
`CdpTransport` (`send` + `on`), never a host API, and compiles without Node
types, so the same pipeline can run in Node, Electron's main process, or an
extension service worker. Four properties make it work, and changes must
preserve them:

1. **One FIFO queue.** Every source pushes into a single queue synchronously,
   from inside its CDP event handler, so the order events reach the engine is
   the order they arrived from Chromium — by construction. That ordering *is*
   the fusion — no per-stream buffering, priority or round-robin merging.
2. **"Next frame after X" is load-bearing.** A lifecycle notification says a
   milestone was reached but not what the user can see; the pixels arrive on a
   later frame. Rules arm on a signal and capture the following frame.
3. **`lastFrame` advances after rules run.** That gap is what lets one rule
   capture the resting frame *before* an event while another captures the frame
   *after* it.
4. **One transport, owned by the host.** All three sources attach to the
   transport the host hands out; streams subscribe and unsubscribe but never
   create or close it. Only the host (`RecordingTarget.close()`) ends it.

### Clocks

Arrival order is the only order the pipeline uses; timestamps are diagnostic.
Every frame, lifecycle event and interaction carries `receivedAtMs`, stamped
by the transport when the event arrived — the one clock comparable across
sources. Sources never read a clock themselves; the clock is injected into the
transport, so tests run on a manual one. Source times keep their own clock under their own name: `swapTimeMs`
(Chromium frame swap, epoch ms), `monotonicTime` (Chromium `MonotonicTime`,
seconds from an arbitrary origin) and `pageTimeMs` (the page's clock, epoch ms).
Never subtract one clock from another.

### Views: page loads and SPA routes alike

To the user, a new page and a new SPA route are the same thing: a next step.
The lifecycle source reports both as `navigated`; a same-document one
(`history.pushState`, `replaceState`, a fragment change) carries
`sameDocument: true` and keeps its document's `loaderId`. One engine module,
`view.ts`, decides what a navigation means:

- **a new view**: a new document, or a same-document change the route
  policy accepts. The default, `pathOrHashRoute`, accepts a change of path or of
  a hash route (`#/…`, `#!/…`). Pass your own as `routePolicy` to
  `startRecording`.
- **a URL update**: a query-only change or an anchor jump. The view goes on, and
  later captures carry the new URL.

Everything downstream sees only views. At every boundary each rule gets a
`view-exit` against the departing view (the `99-before-navigation` capture),
then starts again for the new one, so `00-first` and episode numbering start
over. A rule can carry what it still owes into the next view through
`init(view, previous)`. The click rule uses this: the post-click of a link that
changes the route is filed with its pre-click, under the view it was clicked
in. Records carry `viewId`, `entry` (`load` or `route`), `documentId` and the
`url` showing at capture time.

### Scroll

Scroll capture is removed for now and will be rebuilt step by step. Its first
version raced the probe's scroll signals against the screencast frames: a
`scrollend` could arrive before the frame showing the scroll, which recorded
one scroll twice and gave the post-scroll capture a frame from before it.
Frames still carry the page's scroll offset (`scrollX`/`scrollY`), and every
record keeps the offset of its frame.

### Attaching to a page that already has a document

Enabling lifecycle reporting makes Chromium first report every milestone the
current document has already reached. The lifecycle source starts listening
only after that, so rules never arm on a past milestone — attaching to a loaded
page yields `00-first`, not a stale `01-domcontentloaded`.

---

## Packages

| Package | Role |
| --- | --- |
| `@openuji/core` | Domain types, the `createPushStream` push-to-pull primitive, the `CaptureSink` contract, base64 frame helpers. Zero deps, isomorphic. |
| `@openuji/cdp` | The `CdpTransport` contract every host implements, the `RecordingTarget` a host hands out, an event router for hosts with one generic event callback, and a fake transport for tests. Isomorphic. |
| `@openuji/client-probe` | The in-page DOM probe: an `installProbe(report)` core plus the CDP-binding entry, bundled by esbuild into an injectable IIFE source string. |
| `@openuji/stream-compositor` | CDP screencast frames. |
| `@openuji/stream-lifecycle` | Navigations (`navigated`, to a new document or within the same one) and Chromium's lifecycle milestones (`milestone`). |
| `@openuji/stream-interaction` | Installs the probe, decodes its binding callbacks. |
| `@openuji/fused` | Orchestrator: three sources on one transport, one ordered `DomainEvent` stream; `startRecording` runs it through the engine into sinks. |
| `@openuji/engine` | `reduce()` — the whole engine as one pure function — plus a thin stateful wrapper, and `view.ts`, which decides when a view begins. |
| `@openuji/rules-document` | One-shot rules: first frame and farewell per view, lifecycle milestones per document. |
| `@openuji/rules-interaction` | Repeating numbered episodes carrying DOM target metadata. |
| `@openuji/sinks` | Optional capture destinations: console and PNG + NDJSON persistence. |
| `@openuji/host-puppeteer` | Puppeteer-launched Chrome for Testing as a host: `launchPuppeteerTarget()`. The only library package that depends on Puppeteer. |
| `@openuji/host-extension` | A tab in the user's own Chrome as a host, through `chrome.debugger`: `attachTab()`. Isomorphic: `chrome.debugger` is passed in. |
| `@openuji/cli-kit` | Shared launch, navigation and shutdown scaffolding for the Node CLIs. |
| `@openuji/stream-cli` | Dev runners: each source on its own, and the fused detection pipeline. |
| `@openuji/recorder` | The end-to-end session and its CLI. |
| `@openuji/extension` | The Chrome extension (WXT): the pipeline in its service worker, the journey live in its side panel. |

### Sources run alone or fused — same code

Each stream package exports two functions. `attach*` (`attachCompositor`,
`attachLifecycle`, `attachInteraction`) is the source itself: it subscribes to
the transport, sends its enable commands, emits synchronously, and returns a
`detach`. `create*Stream` wraps it in its own push stream so the source runs on
its own — no orchestrator, no engine, no siblings. The fused orchestrator calls
the very same `attach*`, so what a source does in isolation is exactly what it
feeds the fused stream.

```ts
const target = await launchPuppeteerTarget();           // or any other host
const { events, stop } = await createLifecycleStream(target.cdp);   // one source
const recording = await startRecording(target.cdp, { sinks });      // whole pipeline
```

### Two kinds of rule

They share one interface and nothing else, which is why they are separate
packages:

- **Document rules** fire at most once: the first frame and the farewell once
  per view, the lifecycle milestones once per document (they are scoped to its
  `loaderId`, since only a load produces them). Adding or removing a milestone
  is an entry in an array — see `lifecycleMilestoneRule`.
- **Interaction rules** repeat within a view, number each episode from 01 in
  every view, and tag every capture with what the user touched.

### Hosts

A host hands the pipeline a `RecordingTarget`; the pipeline never sees more of
it than the transport. Every host reaches CDP through an interface its vendor
supports — Chromium does not support third-party applications opening a
DevTools connection of their own, so no host does.

| Mode | Host | CDP through | Chrome |
| --- | --- | --- | --- |
| Node CLI | `@openuji/host-puppeteer` | Puppeteer `CDPSession` | Chrome for Testing, pinned with Puppeteer |
| Extension | `@openuji/host-extension` | `chrome.debugger` | the user's own Chrome |
| Desktop (later) | — | Electron `webContents.debugger` | the Chromium Electron ships |

Headless (`UXR_HEADLESS=1`) runs `chrome-headless-shell`: full Chrome's headless
mode reports every screencast frame at scroll offset 0.

Headed, the page lays out to its real window and reflows when the window is
resized; the viewport size only sets the window's opening content area. The
device scale factor stays pinned at 1, because at any other — a HiDPI screen's
own included — Chrome reports screencast scroll offsets as 0 too.

The extension attaches to a tab the person already has open and keeps after
the recording. It pins the scale factor to 1 for the recording's length, so
the tab renders at 1x on a HiDPI screen until Stop gives it its own back.

Puppeteer and `devtools-protocol` (the CDP types in `@openuji/cdp`) move
together, in one change, to the versions Puppeteer pins. The streams still
depend on specific CDP commands and events, so CI runs the real-browser suite
against the pinned build and the Chromes extension users run: Extended Stable,
Stable and Beta — see below.

---

## Development

```bash
pnpm build       # bundle the probe, then tsc --build across all projects
pnpm typecheck   # everything, browser tier and tests included
pnpm test        # bundle the probe, then vitest against sources — no browser
```

Stream and pipeline tests run on `createFakeCdpTransport()` from
`@openuji/cdp/testing`: script Chromium's events, assert on the commands sent.

### Real-browser compatibility

The fake transport only replays what we believe Chrome sends. `pnpm test:browser`
checks that belief against a launched Chrome: each source alone, then the full
pipeline, on a local fixture page driven through CDP `Input.*`.

```bash
pnpm test:browser                         # pinned Chrome for Testing, headed
UXR_HEADLESS=1 pnpm test:browser          # pinned chrome-headless-shell
UXR_CHROME_EXECUTABLE=/path/to/chrome pnpm test:browser   # any other Chrome
```

CI (`.github/workflows/ci.yml`) runs it headed under Xvfb on every push, pull
request and daily, once per Chrome in the matrix `.github/scripts/chrome-matrix.mjs`
resolves at run time: `pinned`, Extended Stable, Stable and Beta. Extended Stable
is read from Chromium Dash, not derived from Stable — with two-week Stable majors
and eight-week Extended updates it trails Stable by up to three majors. Every
entry must pass.

Each stream is independently runnable — that is the point of the split. The
runners live in `apps/stream-cli`:

```bash
pnpm dev:compositor  https://my.fu-berlin.de/   # frame index, latency, scroll offset
pnpm dev:lifecycle   https://my.fu-berlin.de/   # navigations (SPA routes too), loaderIds, milestones
pnpm dev:interaction https://my.fu-berlin.de/   # clicks, with DOM metadata
pnpm dev:fused       https://my.fu-berlin.de/   # full detection pipeline, zero disk I/O
```

### Extension

```bash
pnpm dev:extension                        # Chrome for Testing with the extension; panel hot-reloads
UXR_START_URL=https://my.fu-berlin.de/ pnpm dev:extension
pnpm build:extension                      # apps/extension/.output/chrome-mv3, for "Load unpacked"
```

The dev browser starts with a fresh profile every run: a kept profile would keep
running the first service worker it installed. Click the toolbar button to open
the panel.

The service worker exposes its recorder as `recorder`: in `chrome://extensions`,
open "Inspect views: service worker" and read `recorder.status` and
`recorder.captures`, or send CDP with `await recorder.cdp.send(...)`. The
browser tests (`test/browser/extension.test.ts`) drive it the same way.

### Backpressure

Every queue is unbounded by default, matching capture-exact behavior. The
compositor pushes full PNG buffers at up to 60fps, so a stalled consumer grows
memory without limit; pass `maxPendingFrames` to `createCompositorStream` or
`maxPendingEvents` to `createFusedStream` for a ceiling. Only compositor frames
are ever evicted — lifecycle and interaction events are the signals rules arm
on. Frames stay base64 (as CDP sends them) until a sink decodes the few that
are captured. Drops are counted in `stats.dropped` and reported at the end of a session
rather than passing silently.
