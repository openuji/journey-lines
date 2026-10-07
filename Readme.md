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
| `interactions.ndjson` | One record per capture: screenshot path, view, URL showing, where the page said it was scrolled, DOM target |
| `nav-00001-00-first.png` | First compositor paint of the view |
| `nav-00001-01-domcontentloaded.png` | Frame following `DOMContentLoaded` |
| `nav-00001-02-settled.png` | Frame following `networkAlmostIdle` |
| `nav-00001-03-pre-scroll-01.png` | Last frame at rest before scroll 1 of the page |
| `nav-00001-04-post-scroll-01.png` | Frame where scroll 1 landed (+ its path) |
| `nav-00001-04-post-scroll-01.webm` | With `UXR_VIDEO=1`: video of scroll 1, from its `03` to its `04` (+ its trace) |
| `nav-00001-10-pre-click-01.png` | Visual state immediately before click 1 (+ DOM target) |
| `nav-00001-11-post-click-01.png` | Compositor response to click 1 (+ DOM target) |
| `nav-00001-99-before-navigation.png` | Final visible frame before navigating away or ending |

Set `UXR_HEADLESS=1` to run without a visible browser window, and
`UXR_VIDEO=1` to also record a video of each scroll.

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
   later frame. Rules arm on a signal and capture the following frame. A page
   that stops moving stops painting, though, so the fused stream also says
   when nothing has arrived for a while: one `quiet` event, after 250 ms.
3. **`lastFrame` advances after rules run.** That gap is what lets one rule
   capture the resting frame *before* an event while another captures the frame
   *after* it.
4. **One transport, owned by the host.** All three sources attach to the
   transport the host hands out; streams subscribe and unsubscribe but never
   create or close it. Only the host (`RecordingTarget.close()`) ends it.

Rules never touch a sink. Each returns what it decided as data: captures, and
for a span it follows (a scroll) clip writes. `startRecording` delivers
captures to the capture sinks and clip writes to its `clips` sink. Whether a
recording makes videos is only which clip sink it is given: `noClips`, the
default, discards them.

### Clocks

Arrival order is the only order the pipeline uses; timestamps are diagnostic.
Every frame, lifecycle event and interaction carries `receivedAtMs`, stamped
by the transport when the event arrived — the one clock comparable across
sources. Sources never read a clock themselves; the clock is injected into the
transport, so tests run on a manual one. Source times keep their own clock under their own name: `swapTimeMs`
(Chromium frame swap, epoch ms), `monotonicTime` (Chromium `MonotonicTime`,
seconds from an arbitrary origin) and `pageTimeMs` (the page's clock, epoch ms).
Never subtract one clock from another.

Time decides one thing: whether the page has stopped, after 250 ms in which
nothing changed. Timers belong to the transport's clock too (`clock.at`), so
the fused stream's `quiet` carries exactly the moment it describes: the last
event's `receivedAtMs` plus 250 ms. The scroll rule then checks every event the
same way, `quiet` included.

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

On an animated page, `00-first` can show the previous page's or route's last
picture: Chrome may deliver it a few milliseconds after the switch. Later
captures of the view are its own.

### Scroll

The page says when it scrolls; the frames say what was seen. The in-page
probe reports where the page is when it starts, its position at every
`scroll` event, and its `scrollend`. Frames choose every picture. The offset
Chrome stamps on each frame can't time a scroll: on a real page
(www.fu-berlin.de, Chrome 154) it stopped changing for up to 660 ms while 27
different pictures arrived and the page reported 72 … 312, and after a scroll
it often never caught up. Timing scrolls from it recorded one gesture as two
or three scrolls.

- **A scroll needs a cause.** The probe also reports what starts one, before
  the page moves:
  - a person: a wheel, touch, a scroll key (PageUp/PageDown, Space, the
    arrows, Home/End, Tab), a press on the page's scrollbar, a click on a
    link to a place on the page;
  - the page's own code: `scrollTo`, `scrollBy`, `scroll`, `scrollIntoView`,
    setting the page's `scrollTop`/`scrollLeft`, `focus()`, a new
    `location.hash`.

  Each came 0–21 ms before the page's first report (Chrome 154). Reports with
  no cause in the 250 ms before them only say where the page now is. Chrome
  sends those when it moves the offset to keep what is on screen in place: a
  window resize, images or fonts loading above. A maximize on fu-berlin.de
  sent 42 `scroll` reports, no `scrollend` and no cause, and was once recorded
  as a scroll.
- A scroll starts at the page's first report after a cause. Its `03-pre-scroll` is the
  newest frame that arrived at least 100 ms before that report: a picture and
  the page's report about it arrive within 100 ms of each other, either way
  round (headed, the report came first by 17–50 ms; in headless-shell the
  picture came first by 6–8 ms).
- Every later report extends it. A report after `scrollend` takes it up
  again, so a spin of wheel notches, or a gesture that moves again, is one
  scroll; a finger resting on the trackpad fires no `scrollend` at all.
- It is over once the page has said `scrollend` and then reported nothing for
  250 ms (or, should `scrollend` never come, has been silent for 1 s). Its
  `04-post-scroll` is the newest frame up to 100 ms after the page's last
  report, where it landed (the landing picture came at most 39 ms after
  `scrollend`), or the first frame since it began if the page paints late.
  Whatever paints after the landing, a click's response or lazy images,
  belongs to what comes next.
- Reports in a view's first 250 ms are the page arriving, not a scroll: a
  router putting the new route at the top, a restored scroll position. A
  scroll still open when the page or route changes, or the recording stops,
  is not recorded.
- The `04` record carries `scrollEpisode.path`: every position the page
  reported (`receivedAtMs`, `pageTimeMs`, `x`, `y`). Its `scrollEpisode.cause`
  says what started it: `kind` (`wheel`, `touch`, `key`, `scrollbar`, `link`,
  `script`) and a `detail` such as `PageDown`, `#section` or `scrollIntoView`.
  Its detail says it in words: "… travelled 600px, by the PageDown key".
  Every record's `scroll`
  is where the page last said it was; a `03`'s is where it was before the
  scroll. It is left out until the page has said.
- Scrolls under 8 px of travel are dropped as jitter.
- **Its frames, for a video.** Next to its captures the rule returns clip
  writes: the `03`, then every frame of the scroll through the `04`, once and
  in order, each with where the page last said it was; then `keep` with the
  `04`, or `drop` for a scroll not recorded. `scroll-clip.ts` reads them off
  the rule's state.
- **The video**, when the recording makes them (`UXR_VIDEO=1` in the CLI, a
  switch in the extension; off by default). `@openuji/clip-webm` encodes in a
  worker, so the recording's own timing is untouched: each PNG is decoded,
  scaled to half size and encoded as VP8 in WebM, all in WebAssembly (a
  vendored libav.js build). It keeps up with a 60 fps scroll and takes about
  1.2 MB per second of scrolling. The video's times are decided in one place,
  next to the pipeline: the `03` shows for at most 250 ms, every frame keeps
  its real spacing, and the `04` stays 250 ms. The file is `….webm` next to
  the `04`, and its own NDJSON line carries `trace`, one sample (`frameIndex`,
  `atMs` in the video, `x`, `y`) per frame of it.
- Known limits:
  - A page busy with its own JavaScript delays its reports (by up to 181 ms
    measured) and can paint a jump late (once 912 ms); a `04` then shows the
    first picture that came.
  - These scroll the page with no cause the probe sees, so they are recorded
    as where the page is, not as scrolls: find in page, middle-click
    autoscroll, dragging a text selection past the edge, and an overlay
    scrollbar (macOS) dragged outside its right-most 16 px.

Not yet: scroll depth, and elements with their own scrollbar. The steps are in
`changes/scroll-rebuild.md`.

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
| `@openuji/clip-webm` | Scroll video: the clip sink's two sides, recorder (video times, trace) and encoder (in a worker), and a WebM encoder on a vendored libav.js build. Isomorphic. |
| `@openuji/sinks` | Optional capture destinations: console and PNG + NDJSON persistence (videos too), and `startClipWorker`, the Node host's encoder thread. |
| `@openuji/host-puppeteer` | Puppeteer-launched Chrome for Testing as a host: `launchPuppeteerTarget()`. The only library package that depends on Puppeteer. |
| `@openuji/host-extension` | A tab in the user's own Chrome as a host, through `chrome.debugger`: `attachTab()`. Isomorphic: `chrome.debugger` is passed in. |
| `@openuji/cli-kit` | Shared launch, navigation and shutdown scaffolding for the Node CLIs. |
| `@openuji/stream-cli` | Dev runners: each source on its own, and the fused detection pipeline. |
| `@openuji/recorder` | The end-to-end session and its CLI. |
| `@openuji/extension` | The Chrome extension (WXT): the pipeline in its service worker, the journey live in its side panel, scroll videos encoded in an offscreen document's worker. |

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
- **Interaction rules** repeat within a view and number each episode from 01
  in every view. A click's captures carry what was clicked; a scroll's carry
  the path the page took.

Within one event, captures come out in rule order, so `defaultRules` lists the
rules in label order: a scroll still open when the view ends is filed before
its `99-before-navigation`.

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

Its panel has a "Video of each scroll" switch before Record, off by default.
On, the service worker opens an offscreen document whose only job is to start
the encoder in a dedicated worker (a service worker cannot start one), and
reaches that worker over a `BroadcastChannel`: no relay, and a send blocks the
service worker 0.2–0.3 ms per frame against 0.9–1.2 ms over a `chrome.runtime`
port (measured with real 460 KB frames at 60 fps). Each video shows as "Play
video" on its scroll's `04` row; Stop closes the document. The manifest's CSP
adds `'wasm-unsafe-eval'`, without which Chrome refuses to compile the encoder.

In this host, on a page that does not repaint by itself, the screencast never
reports a wheel scroll's offset (Chrome 154, at scale factor 1 or 2). Scrolls
are timed by the page's own reports, so they are recorded there all the same.

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
pipeline, on a local fixture page driven through CDP `Input.*`. It builds first:
the video encoder's worker thread runs the compiled `dist`.

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

### The video encoder's WebAssembly

`packages/clip-webm/vendor/libav/` is a build of libav.js (FFmpeg compiled to
WebAssembly) with only FFmpeg's PNG decoder, the scaler, libvpx's VP8 encoder
and the WebM muxer. Rebuild it with `pnpm --filter @openuji/clip-webm
build-libav` (git and Docker); the script pins the libav.js tag and the
Emscripten image, and reproduces the vendored files byte for byte. Unlike the
rest of the repository these files are LGPL-2.1-or-later (FFmpeg) and BSD
(libvpx, zlib); see the README there.

### Backpressure

Every queue is unbounded by default, matching capture-exact behavior. The
compositor pushes full PNG buffers at up to 60fps, so a stalled consumer grows
memory without limit; pass `maxPendingFrames` to `createCompositorStream` or
`maxPendingEvents` to `createFusedStream` for a ceiling. Only compositor frames
are ever evicted — lifecycle and interaction events are the signals rules arm
on. Frames stay base64 (as CDP sends them) until a sink decodes the few that
are captured. Drops are counted in `stats.dropped` and reported at the end of a session
rather than passing silently.
