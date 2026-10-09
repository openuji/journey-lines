# What they see: recording interaction inside one view

An evaluation protocol: the problem, the user's decisions, what was measured and
how, what the measurements decide, and what is still open. The sections follow
the work chronologically; later implementation notes supersede earlier plans.

- Started 2026-10-08, branch `feature/decouple-playwright`.
- Measured on Chrome for Testing **156.0.8078.4** (macOS arm64), Puppeteer host,
  viewport 1280×800, device scale factor 1. Headed unless a row says headless.
  The display runs at 120 Hz.
- Input was dispatched over CDP (`Input.dispatchMouseEvent` / `dispatchKeyEvent`),
  not by a person. Rows that may differ for a real mouse say so.

---

## 1. The problem

The recorder picks a few pictures per step: a view starts (`00`–`02`, `99`), a
scroll lands (`03`/`04`), a click happens (`10` pre-click / `11` post-click).
That works when a step means "the page looked like A, now it looks like B".

It breaks on UI that stays on one page and is used many times in a row, often
with animation: date pickers, calendars, filters, menus, drag and drop.

- **Nothing navigates**, so every interaction lands in one view.
- **`11-post-click` is the first frame that arrives after the click report**
  (`packages/rules-interaction/src/click.ts`, the `event.type === 'frame'`
  branch). On an animated widget that frame shows a focus ring or the first
  frame of a motion; the result only shows in the next click's `10`.
- **Nothing is recorded between clicks**: where the pointer went, what was
  hovered, how long the person hesitated, which keys moved focus.
  The probe reports `click` and scrolling only
  (`packages/client/probe/src/browser/install.ts`). `input`/`change` exist in
  the wire type but are never sent.
- **Frames carry no meaning**: nothing says "the month changed to November" or
  "the 14th is selected".

## 2. Decisions and constraints so far

From the user (2026-10-08):

1. **Timing comes from the source, not from arrival.** A host-side
   `receivedAtMs` is not frame-accurate: transport delay and batching can change
   the order of events and frames. Keep the probe's own event time
   (`event.timeStamp`), and compare it with the screencast's time. Chrome 156
   stamps every screencast frame with `monotonicTimestamp`, so the plan moves
   to Chrome ≥ 156 (M156 Stable is due 2026-10-20).
2. **Test page:** <https://raumbuchung.ub.fu-berlin.de/lernort/load.php>, which needs no login.

Standing project rules that a plan must keep (from earlier sessions):

- `reduce()` and every rule stay pure. Rules return captures and clip writes
  as data; the pipeline delivers them to sinks.
- How something is output (pictures, video) is host configuration, never a rule
  option. Below the composition root, use null objects (`noClips`), not
  `if (setting)`.
- One concept per meaning to the person recorded; technical variants are data
  fields (`entry`, `cause`), not separate code paths. Record every data point
  available; never guess a value (omit it when unknown).
- Plans describe current and planned behavior in separate "today" and
  "after" columns.
- **Note:** the Readme and `packages/core/src/domain.ts` say *arrival order is
  the only order fusion and rules rely on; never subtract one clock from
  another*. Decision 1 changes that for placing events against frames. The
  plan has to say so explicitly (see §6.1). An earlier "one timeline on Chrome's
  clock" attempt (2026-10-06) was set aside for **view boundaries** (a page
  switch is not an instant for pictures). That remains true; this is about
  placing input and frames **within** a view.

## 3. The direction under evaluation

Record three tracks continuously, and derive the steps from them:

1. **What the person did** (probe): pointer position, hover target changes,
   pointer down/up, click, keys (characters masked), focus moves,
   `input`/`change` (values masked).
2. **What the page did** (probe): meaningful DOM changes (something with a role
   appeared or disappeared, state attributes, text of headings and live
   regions), CSS animations and transitions starting and ending, focus,
   form-control values.
3. **What they saw**: every frame, for example one video per view. Clips can
   already record any span, not just scrolls (`packages/core/src/clip.ts`:
   "Today the span is a scroll").

A **step** has the same shape as a scroll: a cause, then movement, then rest.
The page's reports decide when it ends; frames choose its pictures. This
generalizes the 2026-10-07 scroll decision.

---

## 4. The test page

MRBS (a PHP room-booking system) with jQuery 3.5, jQuery UI, Bootstrap,
**flatpickr** and a datalist field. Server-rendered; widgets on top.

| Thing | What it is |
| --- | --- |
| "Tag" field | flatpickr `altInput` (readonly text field); the real `input#date` is hidden |
| Calendar | `div.flatpickr-calendar.animate`: opens with a 300 ms CSS animation `fpFadeInDown`; month arrows have a 0.1 s `fill` transition on hover |
| Month name | a native `<select class="flatpickr-monthDropdown-months">` |
| Year | `input.numInput.cur-year` (value set as a property) |
| Days | `span.flatpickr-day` with `aria-label` ("Oktober 8, 2026") and `aria-current` on today; **no** `role=grid`, no `aria-selected` |
| "Bereich" field | `<input type=text list=…>` with a native `<datalist>`; MRBS mirrors its value into a hidden `input#areamatch` |
| Submit "Einträge" | POSTs a query for free slots |
| Shadow DOM / iframes | none (0 / 0) |
| Focus styling | every focused field runs a 150 ms transition on 4 border colors + `box-shadow` |

## 5. Method

A scratch lab separate from the recorder pipeline: a raw CDP session on a
Puppeteer page.

- **Frames:** `Page.startScreencast` (PNG, every frame), each acked at once;
  kept: host arrival time, `metadata.monotonicTimestamp`, `metadata.timestamp`.
  All frames saved as PNG for pixel checks.
- **Lab probe:** `Page.addScriptToEvaluateOnNewDocument` + `Runtime.addBinding`.
  It reports `pointermove` (three modes, below), `pointerover`, `pointerdown`,
  `pointerup`, `click`, `focusin`, `keydown`, `input`, animation and transition
  events, a `MutationObserver` summary per callback, and (in one run) Long
  Animation Frames and Event Timing. Every report carries `event.timeStamp`,
  the page's `performance.now()` at sending, and wall time.
- **Clock bridge:** an event's Chrome monotonic time is
  `NavigationStart` (CDP `Performance.getMetrics`, seconds) +
  `event.timeStamp / 1000`. Measured earlier (2026-10-06) to match Chrome's own
  `DOMContentLoaded` within ±0.14 ms. Chrome's wall − monotonic offset, read
  from frames that carry both, stayed within 0.155–0.166 ms over every run, so
  host arrival times can be compared with it.
- **Ground truth is pixels.** A response frame is the first frame (by
  `monotonicTimestamp`) whose pixels in the affected box differ from the frame
  before the event (per-channel sum > 24, more than 20 pixels).
- **Scenario** (per run, about 20 s): load; wander to the Tag field; click it
  (calendar opens); sweep the pointer over 7 days with two 300 ms dwells; next
  month ×2 (800 ms apart), ×3 (about 300 ms apart); previous ×1; ArrowRight,
  ArrowRight, ArrowDown, ArrowLeft, Enter; 1.5 s idle; click "Bereich", type
  "2. S", ArrowDown, Enter; 1.5 s idle.
- **Runs:** `immediate`, `raf`, `batch50` (pointer modes, headed), `headless`
  (immediate, new headless), `et` (immediate + Event Timing + Long Animation Frames).
  Plus `stall` (36 + 36 calendar openings) and `popups`.

Scripts (session scratchpad, will not survive a reboot):
`/private/tmp/claude-501/-Users-zavalit-Projects-fu-uxr-chromium-watch/5b4463bf-09bb-4096-a43c-757758695d5d/scratchpad/cal/`:
`lab.mjs <mode> <dir>` (record), `analyze.mjs <dir>` (clock, inversions, today's
clicks vs pixels, mutations), `order.mjs <dir>` (arrival vs clock placement),
`dump.mjs <dir>` (timeline), `stall.mjs` / `stall-moves.mjs` (repeated
openings), `popups.mjs`.

---

## 6. Evaluations

### E1. Can probe events be placed against frames by Chrome's clock?

**Yes. In every hover checked, the clocks agreed with the pixels.**

| Run | Hovers checked | Frame just before the event (by clock) shows no hover | Response drawn after the event | Event → response (ms) |
| --- | --- | --- | --- | --- |
| immediate | 11 | 11/11 | 11/11 | p50 8.8, max 127 |
| raf | 11 | 11/11 | 11/11 | p50 13.0, max 139 |
| batch50 | 10 | 10/10 | 10/10 | p50 5.9, max 9.7 |
| headless | 11 | 11/11 | 11/11 | p50 20.4, max 141 |
| et | 11 | 11/11 | 11/11 | p50 8.9, max 104 |

**Delays per channel, against each one's own source time** (headed, immediate):

| | p50 | p95 | max |
| --- | --- | --- | --- |
| Probe report arrival − `event.timeStamp` | 1.0 ms | 8.7 ms | 12.2 ms |
|  of which in the page (handler/send − `event.timeStamp`) | 0.6 | 8.0 | 10.8 |
|  of which in transport (arrival − send) | 0.5 | 1.1 | 2.2 (one 44 ms outlier in `et`) |
| Frame arrival − `monotonicTimestamp`, headed | 1.3–3.2 | 20.6–38.4 | **44–369** |
| Frame arrival − `monotonicTimestamp`, headless | −5.3 | 37.9 | 203 |

In headless, frames usually arrive about 5 ms *before* the display time they are
stamped with: the stamp is the expected display time.

**Arrival order chooses a different "frame before the event" than the clocks**
in a sizable share of events (frame before = last frame that arrived before the
report, against last frame drawn before the event):

| Run | `pointerover` | pointer move | `pointerdown` | `pointerup` | `click` | `keydown` |
| --- | --- | --- | --- | --- | --- | --- |
| immediate | 6/48 | 5/156 | 1/8 | 3/8 | 3/9 | 0/11 |
| raf | 4/83 | 6/248 | 0/8 | 2/8 | 2/9 | 0/11 |
| et | 8/51 | 15/156 | 2/8 | 2/9 | 2/8 | 0/11 |
| headless | **17/48** | **25/156** | 0/8 | 2/8 | 2/9 | 0/11 |

**Frames themselves can arrive out of order:** 1–2 pairs in the raf, batch50 and
et runs, each pair drawn 8–17 ms apart and delivered swapped, within 1.5 ms of
each other, in bursts after a late delivery.

**Conclusion:** with Chrome 156, frame `monotonicTimestamp` and the probe's
`event.timeStamp` (bridged by `NavigationStart`) place input against frames
correctly. Arrival order does not (5–35% of pointer events, up to a third of
clicks), and gets worse when frames are late.

### E2. How should pointer samples leave the page?

Inversion = the frame showing a hover response arrived **before** the report
carrying the pointer sample that caused it:

| Mode | How samples are sent | Inversions | Report arrival − event |
| --- | --- | --- | --- |
| immediate | one binding call per `pointermove` | 0/11 | p50 1.3, max 12.3 ms |
| raf | latest sample once per animation frame | 0/11 | p50 5.5, max 21.2 ms |
| batch50 | collected, sent every 50 ms (p50 3 samples) | **7/10** | oldest sample p50 44, max 52.5 ms |

- **Batching on a timer is out**: the report comes after its own response.
  Immediate and per-animation-frame both work. In every mode, placement by the
  clocks was right (E1); only arrival order breaks.
- In this lab the rAF rate (120 Hz) was above the input rate (CDP moves about
  every 10 ms), so `raf` coalesced nothing (p50 1 sample per report). A real
  mouse at 125–1000 Hz would coalesce; **not measured**.

### E3. Do frames show every animation?

**Usually, but not always.** The 300 ms `fpFadeInDown` (calendar opening):

| Run | Frames drawn during the animation | Notes |
| --- | --- | --- |
| immediate (headed) | **4**: at +0, +8, +358, +375 ms | the first two delivered 362–369 ms late; the +358 ms frame shows the calendar at about 20% opacity, the next one complete |
| headless | **8**: +13, then +197 … +297 ms | first delivered 189 ms late |
| raf, batch50, et | 26, 29, 28 | one every 8–17 ms |

The same kind of stall hit the "Bereich" field's focus (frames up to 198 ms late)
and once a month arrow (frames changed at +8 ms, then +217 ms; batch50).

**Repeated openings (6 per page load, 3 fresh browsers each):**

| Setup | Openings | Stalled | Clean openings |
| --- | --- | --- | --- |
| click only, headed | 18 | 0 | 25–29 frames, max gap 17–18 ms |
| click only, headless | 18 | 0 | 17 frames (60 Hz), max gap 17 ms |
| 40-step pointer wander before each click, **every move reported** | 18 | **1** (11 frames, max gap 107 ms, 153 ms late) | 26–29 frames |
| same wander, moves not reported | 18 | 0 | 26–29 frames |

- **No Long Animation Frame** was recorded during any opening, stalled or not
  (only the page load produced one: 145 ms). The page's script didn't cause it.
- All 3 stalls of the opening happened in runs that reported every pointer move
  (3 of 21 such openings); 0 of 56 openings without per-move reports.
  **Suggestive, not proven.** The cause is unknown.

**Consequences:**

- A frame can arrive hundreds of ms after it was drawn, and an animation can be
  missing from the frames. Any "before/after" decision needs a wait or reorder
  window longer than the usual 0–40 ms, or must accept late corrections.
- Whether per-event binding traffic causes stalls must be settled before
  choosing `immediate` over `raf` (see §8).

### E4. Today's click pictures on this calendar

flatpickr changes month on **`pointerdown`**, not on `click`. `click` comes at
release, 62–80 ms later in the lab (CDP presses of 60–70 ms; a person's press
is typically longer). The month change is a single frame, drawn **9–21 ms after
`pointerdown`**, before the click report exists.

What today's click rule picks (pre = last frame that arrived before the `click`
report; post = first frame that arrived after it):

30 month-arrow clicks: 6 per run (next ×2 slow, next ×3 rapid, previous ×1) × 5 runs.

| Which click | `10-pre-click` | `11-post-click` |
| --- | --- | --- |
| all 30 | **already shows the new month in 29/30** (1 427–6 164 px changed against the frame before the press); the 1 exception was in a stall (batch50) | see below |
| 2nd–4th (15) | – | **the next press's month change**, arriving 219–945 ms later (1 427–3 841 px away from this click's result) |
| 5th, last of the rapid three (5) | – | a hover change from moving to the previous arrow, 1.1 s later |
| 1st (5) | – | a frame inside the arrow's 0.1 s fill transition (933–1 155 px from where it came to rest) |
| previous (5) | – | close to where it came to rest (0–24 px) |
| opening the calendar (Tag field), immediate run | correct (unchanged) | a frame with only the start of the focus ring (336 px), delivered 313 ms late in that stalled run; the calendar was complete about 400 ms after the press |

**This reproduces the reported symptom**: the pre-click shows the result, and
in half the cases the post-click shows what the *next* interaction did.

Keys: each arrow key moved focus between days with one frame, 5–10 ms after
`keydown`, and **no DOM mutation**. Only `focusin` says what happened. Enter on
a day selected it and closed the calendar: one mutation callback, 15 frames
(the 150 ms field-border transition).

### E5. What does the page tell us about what it did?

**Mutation volume is small here:** 13 callbacks, 78 records in a whole
immediate run.

| Person did | MutationObserver saw | Missed |
| --- | --- | --- |
| open calendar | class `+open,arrowTop` on the calendar, `+active` on the field | – |
| next/previous month | `childList` +1/−1 on `div.flatpickr-days`: the whole day grid replaced | **the month name** (a `<select>`'s value, a property) |
| crossing into a new year | the month `<select>` rebuilt (13 options) | **the year** (`input.value`, a property) |
| hover a day | nothing | **hover** (CSS `:hover`) |
| arrow keys | nothing | **focus** (only `focusin` has it) |
| Enter on a day | `value` attribute on the hidden `input#date`, class `−open` | the visible field's text (a property) |
| type in "Bereich" | `value` on hidden `input#areamatch` (MRBS mirrors it; page-specific) | the typed text in the visible field |

- Animation events are accurate (`fpFadeInDown` start/end) but **transitions
  are noisy**: every focus change fires `transitionrun`/`start`/`end` for 5
  properties (4 border colors + `box-shadow`). They need grouping per element.
- Reports arrive 3–5 ms (p50) after their event time.

**Conclusion:** the "what the page did" track can't be `MutationObserver`
alone. It also needs focus (`focusin`), form-control values read as properties
(on `input`/`change`, and from a replaced subtree), and a description of what a
replaced subtree shows (here the days' `aria-label` and `aria-current`). ARIA
can't be relied on: this widget has no grid role and no selected state.

### E6. Does the screen ever stop moving?

- Idle with nothing editable focused (calendar closed, readonly field focused):
  **0 frames** in 1.2 s, twice.
- Text field focused: **the caret blinks**, one frame about every 500 ms
  (32 changed pixels).
- **Consequence:** the fused stream's `quiet` (250 ms without events) still
  fires between blinks. "No frames for longer than 500 ms" never happens while a
  text field has focus, so "the screen has stopped" can't be the only
  end-of-step signal.

### E7. Chrome's own timing in the page

- **Event Timing** (`PerformanceObserver({type:'event', durationThreshold:16})`)
  works: 265 entries in one run, including `pointerover`/`out`/`enter`/`leave`.
  `interactionId` groups `pointerdown` + `pointerup` + `click`. Duration is
  rounded to 8 ms. On CfT 156, `paintTime` and `presentationTime` are **absent**
  on event entries.
  - Its next paint (start + duration) came 0.5–30 ms **after** the first frame
    that showed the change (by `monotonicTimestamp`).
  - So it can't choose frames. It is still Chrome's own input delay /
    processing / presentation figure per interaction, the INP data.
- **Long Animation Frames** (`long-animation-frame`) works, with script
  attribution. On this page only the load produced one (145 ms).

### E8. Native popups

- With the datalist field showing suggestions and the month `<select>` clicked,
  **no screencast frame showed a popup**. Frames showed only the field, its
  text and the caret.
  - `Page.captureScreenshot` showed none either.
- **Not confirmed that the popups were open**: the OS screenshot captured the
  editor window in front, not Chrome. The lab didn't bring Chrome to the
  front to avoid taking over the screen.
- Expected from Chromium's design: `<select>` on macOS is a native menu, and
  datalist/autofill suggestions are separate popup widgets, both outside the
  page's compositor surface. **Manual check, about 1 minute:** record
  `load.php`, type "2" into "Bereich" and open the month select by hand, then
  look at the frames.
- **If confirmed:** pixels can't show which options a person saw or
  highlighted, so the probe must report it (options of the focused
  `select`/datalist, the highlighted and chosen one).

### E9. Hover without movement

The opening animation slid the calendar under a pointer that didn't move:
`pointerover` on the calendar's month header, then 32 ms later back over the
field (et run).

**Consequence:** a hover change is not proof that the person moved. The input
track must keep pointer movement and hover-target changes apart.

### E10. A click the mouse didn't make

Enter in the "Bereich" field submitted the form: Chrome dispatched a `click` on
the submit button, which the probe reported like any click (target rect, 1–2 ms
after the Enter `keydown`). Today's click rule would file it as a mouse click.

**Consequence:** a click needs its input source. A keyboard-made click is
expected to have `detail === 0`; **not measured**.

### E11. Other observations

- **The pointer is not in screencast frames.** Not measured, because CDP input
  moves no OS cursor. Assume a player must draw it from the input track.
- **Screencast frame rate:** headed up to 120 Hz (8 ms apart) while things move;
  headless 60 Hz.

---

## 7. What the measurements decide (proposed; for the user to confirm)

| # | Today | After |
| --- | --- | --- |
| 1 | Events and frames are ordered by arrival at the host | Events are placed against frames by Chrome's monotonic clock: frames by `monotonicTimestamp`, probe events by `NavigationStart` + `event.timeStamp`. Arrival order still drives the queue, but no longer decides before/after. Requires Chrome ≥ 156. |
| 2 | Probe sends click and scroll reports at once | Every report carries `event.timeStamp`. Pointer samples go immediately or once per animation frame, **never on a timer** |
| 3 | A click's response starts at `click` | An interaction starts at its first input event (`pointerdown`, `keydown`), grouped like Event Timing's `interactionId` (down + up + click) |
| 4 | `10` = last frame that arrived before the click report | `10` = the frame showing when the interaction began (last frame drawn before `pointerdown`) |
| 5 | `11` = first frame that arrived after the click report | `11` = where the response came to rest: the page's reports say when (no mutation, no running animation/transition for 250 ms, or the next input), frames choose the picture |
| 6 | Between clicks: nothing | Input track: moves, hover changes (movement and content-moved kept apart), down/up, keys (masked), focus, `input`/`change` (masked), click input source |
| 7 | Page response: nothing | Page track: mutation summary + focus + control values + description of replaced subtrees; transitions grouped per element; Event Timing and LoAF entries as data |
| 8 | Native popups: invisible, unknown | (if E8 confirms) the probe reports popup options and the highlighted option |

## 8. Open questions and next measurements

1. **Does per-event binding traffic stall frames?** E3 is suggestive only.
   Measure with a CDP trace (`Tracing.start` with `viz` / `gpu` / `cc`
   categories) during openings with per-move reports. Measure in **both hosts**:
   the extension's `chrome.debugger` path wasn't measured at all.
2. **A real mouse.** Coalescing in `raf` mode, sample rates (125–1000 Hz), and
   press length (mousedown → click) with a person, not CDP.
3. **How long to wait before deciding.** Frames arrived up to 369 ms late.
   - Option A: the engine processes in clock order behind a watermark (a delay).
   - Option B: decide on arrival, and correct when a late frame turns up.
   - Both change the engine's "one FIFO, arrival order" property. The user
     decides.
4. **Native popups** (E8 manual check).
5. **Per-document bridge in the extension host.** `Performance.getMetrics` is
   allowed through `chrome.debugger` (checked 2026-10-06). A bfcache restore
   has no lifecycle events; how its `NavigationStart` behaves is not measured.
6. **Frames that never come** (E3): a step whose motion is missing from the
   frames still needs its end picture. Is the first frame after the stall
   enough?
7. **Caret and other ambient motion** in the video and in "at rest" decisions
   (E6). Is a caret-only change (about 32 px) ignorable, and how is that
   decided without guessing?
8. **Privacy defaults:** which input values and key characters are masked;
   recordings at FU are of real people.

## 9. Draft plan outline (not decided)

- **P0 — Time.** Chrome ≥ 156 for both hosts. The probe carries
  `event.timeStamp`. The host reads `NavigationStart` per document and gives
  each probe event a monotonic time. Frames keep `monotonicTimestamp`. Decide
  §8.3. Rewrite the clock rules in Readme / `domain.ts`.
- **P1 — Input track.** Probe reports per §7.6, with the transport choice
  settled by §8.1. No pictures change.
- **P2 — Interaction step.** A rule beside scroll, not merged into it, with the
  same vocabulary (cause, motion, rest). It fixes `10`/`11` per §7.4–7.5.
  Clips for steps come from the existing clip machinery, switched on at the
  host.
- **P3 — Page track.** Per §7.7; derived signals (dead clicks, rage clicks,
  hesitation, back-and-forth, response time) as pure functions over a finished
  recording, outside the engine.
- **P4 — What they saw.** A video per view with the cursor drawn from P1. Decide
  whether scroll clips stay separate.

Architecture guardrails for every phase:

- Recording a track needs no rule.
- Rules only decide steps and pictures.
- Output is chosen at the composition root.
- Each new decision lives in one module.

---

# Part 2 — Scope reduced: correct interaction screenshots (2026-10-08)

The user narrowed the scope: **only `10-pre-click` and `11-post-click` must be
correct.** Pointer tracking, semantic analysis and continuous video are out of
scope for now. Agreed so far: explore source timestamps, and define an
interaction from its first input event to its settled response.

Questions to answer before any implementation:

1. What is the smallest architectural change that makes `10` and `11` correct?
2. How do we handle late or out-of-order frames without arbitrary timing
   assumptions?
3. How do we know an interaction has finished, including when animations or
   DOM changes are missing?
4. Which of these still need measurements rather than decisions?

**The user's challenge to the quiet-period rule:** suppose the next-month
button triggers a request that takes 600 ms. The page can be completely still
for the first 250 ms, so the recorder declares the interaction finished; then
the response arrives and the calendar changes. "The page became quiet" is not
"the interaction finished". That is a product question, and it must be tested
before quiet becomes a foundation.

Each item below is marked **measured** (with conditions), **assumption**
(believed, not checked here) or **recommendation**.

## Part 2 evaluations

### E12. How Chrome delivers screencast frames (source reading)

**Measured from source:** Chromium tag `156.0.8078.4`,
`content/browser/devtools/protocol/page_handler.cc` and
`third_party/blink/public/devtools_protocol/domains/Page.pdl`.

- `Page.startScreencast` has two (experimental) parameters the recorder doesn't
  pass today (`packages/stream-compositor/src/index.ts` sends format, quality,
  everyNthFrame, maxWidth, maxHeight only):
  - `maxFramesInFlight`: "Maximum number of frames sent until
    screencastFrameAck is required. Defaults to 3."
  - `sendLastFrame`: "enables storing the last produced frame in memory, which
    is immediately sent upon screencastFrameAck … overall performance is traded
    for a better latency." Default false.
- Every frame to be sent is encoded on the thread pool
  (`base::ThreadPool::PostTaskAndReplyWithResult`) and goes out when its encode
  finishes. With up to 3 in flight, **encodes run in parallel and can finish
  out of order**. That explains the swapped pairs in E1.
- With the default `sendLastFrame: false`, a frame produced while 3 frames are
  in flight is **dropped** ("a choice for performance over latency").
  `frames_in_flight_` goes down only when the host acks. A frame is produced only
  when the page's pixels change, so **if the last change of a response is
  dropped and the page then stays still, the final picture is never
  delivered.** That explains the animation frames missing in E3, though not
  why delivery was slow there.
- With `sendLastFrame: true`, a frame that can't go out is kept, and a newer one
  replaces it; it is sent on the next ack. **The newest picture is never lost**,
  but intermediate ones can be skipped.
- **Assumption (from the code, to be measured):** with `maxFramesInFlight: 1`,
  only one encode runs at a time and the next frame is sent only after the ack.
  Frames then arrive in the order they were produced.
- `metadata.monotonicTimestamp` is the captured frame's `reference_time`
  ("frame swap timestamp as monotonic time"). `metadata.timestamp` (wall clock)
  is the same instant, converted with `Time::Now() − (TimeTicks::Now() − t)`
  when the frame is handed over; it would jump if the system clock were
  adjusted.

### E13. Screencast with `maxFramesInFlight: 1, sendLastFrame: true`

**Measured** (same calendar scenario as Part 1, headed; runs `strict`
(immediate pointer reports) and `strict-raf`):

| | Default (Part 1, 5 runs) | Strict (2 runs) |
| --- | --- | --- |
| Frames arriving out of production order | 1–2 pairs in 3 of 5 runs | **none** |
| Frame arrival − `monotonicTimestamp`, p95 | 20.6–38.4 ms | 13.1–13.5 ms |
| … max | 44–369 ms | 47–53 ms |
| Frames during the 300 ms calendar opening | 4–29 | 28, 28 (max gap 17–18 ms) |
| Hover check by clock (E1) | correct in every run | 11/11, 11/11 |
| Arrival order picks a different "frame before" than the clock | 5–35% of pointer events | `pointerover` 5/48 and 1/48, moves 7/156 and 3/156, `click` 1/9 |

Repeated openings with a pointer wander reported on every move (as in E3):

- Clean in 46 of 48 completed openings: 25–29 frames, max gap 17–25 ms,
  max lateness 0–18 ms.
- **2 openings had gaps** (20 frames with an 84 ms gap; 9 frames with a 143 ms
  gap), both in one browser. That browser's frames also had inconsistent
  wall-clock stamps (wall − monotonic varied by minutes), so its run is
  suspect. Unexplained.
- Another browser's session closed mid-run (`Session closed`). Unexplained.

**Conclusions:**

- Strict mode removes reordering and the lost-final-frame case (E12), and cuts
  lateness. It doesn't make arrival order a correct "before/after" judge: a
  frame drawn just before an input can still arrive after the input's report
  (frames lag 1–13 ms; reports about 1 ms).
- **Assumption:** with `sendLastFrame`, skipping intermediate frames under load
  is by design. A "frame before" can therefore be older than the true one when
  the screen was changing right at the input. For a screen at rest before the
  input it is exact.
- The cost of strict mode (frame rate under load, CPU) is not measured beyond
  this page.

### E14. Is Chrome 156's monotonic stamp needed, or does the page's wall clock do?

**Measured** (all 7 calendar runs): the page's wall time
(`performance.timeOrigin + performance.now()`) against the bridged Chrome time
(`NavigationStart + performance.now()`, converted with the frames' own
wall − monotonic offset):

- differed by a **constant −0.00 … −0.12 ms** within each document (n = 235–635
  reports per run);
- the frames' own wall − monotonic offset varied 0.155–0.193 ms within a run.

**Conclusions:**

- `performance.timeOrigin + event.timeStamp` (page, epoch ms) and frame
  `metadata.timestamp` (epoch s) agree as well as the monotonic bridge, under a
  stable system clock, without a CDP call per document.
- **Assumption (from E12's source reading):** both sides are wall-clock
  conversions made at different moments (the page's at navigation start, the
  frame's at handover). A system clock adjustment between them shifts one but
  not the other. The monotonic bridge (`NavigationStart` +
  `event.timeStamp` vs `monotonicTimestamp`) is immune; that is the reason to
  prefer Chrome ≥ 156.

### E15. The user's challenge: a response that comes after a quiet stretch

**Measured** on a local test page (scratchpad `async.mjs`): a calendar whose
"›" button, on `click`, renders the next month in one of six ways. Strict
screencast (E13), headed CfT 156, CDP input with an 80 ms press.

- `instant`: renders at once (control).
- `fetch`: waits for a 600 ms response, no indicator.
- `spinner`: same, with a CSS spinner while waiting.
- `skeleton`: greys out the days at once, then renders when the 600 ms response
  arrives.
- `timer`: `setTimeout(600)`, no network.
- `fetch1500`: a 1 500 ms response.

"Quiet" means what a 250 ms quiet rule would decide: the first 250 ms after the
press with no frame and no page report (mutation, animation, input), on
Chrome's clock. Times are ms after `pointerdown`.

**The person waits (no further input for 2.5 s):**

| Variant | First change | Calendar shows the new month | Quiet ends at | Picture at quiet is the final screen | Request (start → end) | Requests in flight at quiet |
| --- | --- | --- | --- | --- | --- | --- |
| instant | 7 | 7–91 | 341 | **yes** | – | 0 |
| fetch | 5 | 698 | 340 | **no** | 83 → 688 | 1 |
| spinner | 6 | 706 | 956 | **yes** | 84 → 688 | 0 |
| skeleton | 7 | 698 (grey at 7) | 339 | **no** (shows the grey skeleton) | 84 → 689 | 1 |
| timer | 7 | 690 | 349 | **no** | – | 0 |
| fetch1500 | 13 | 1 597 | 338 | **no** | 84 → 1 587 | 1 |

The first change at 5–13 ms is the button's own pressed look, not the calendar.

**The person acts early (second press at +305–314 ms):**

- Measured from the first press, quiet ends at +644–954 ms.
- In every slow variant the first press's response lands **after** the second
  press.
- The quiet picture was the final screen only for `instant`.

**What three end rules would give** (the person waits):

| End rule | Right final picture | Fails on |
| --- | --- | --- |
| 250 ms quiet | 2 of 6 | fetch, skeleton, timer, fetch1500 |
| 250 ms quiet **and** no request started since the press still in flight | 5 of 6 | timer: nothing on the page says a timer is pending |
| the person's next action (next input, view change, stop) | by definition, the screen when they moved on: the new month if they waited, the old one if they acted early | – (a product definition, not a measurement) |

**Conclusions:**

- The challenge holds. "The page became quiet" is not "the interaction
  finished": the 250 ms rule took the wrong picture whenever the response came
  later and nothing moved meanwhile.
- A spinner rescues it only because it keeps frames coming.
- A network-aware rule fixes request-bound responses but not timers, and needs
  requests attributed to the interaction. CDP shows the request's initiator as
  `script`, top frame anonymous (the click handler).
- **Nothing observable says "this interaction's effects are complete".**

### E16. Background requests on the real page

**Measured** (CDP `Network`, headed, `load.php` and `index.php?area=1`):

- 30 and 34 requests during load;
- **0 requests** in 10 s idle on each page, and **0** while opening the
  calendar and paging 4 months: flatpickr is client-side.

So on this site, a "request in flight" rule would never be held open by
background traffic. Other sites (analytics, polling, websockets): **not
measured**.

---

## Part 2 answers

### Q1. The smallest architectural change that makes `10` and `11` correct

**Facts it rests on:**

- The response can start at `pointerdown`, before `click` (E4: 29/30 pre-clicks
  already showed the result).
- Arrival order picks the wrong frame for some events, even in strict mode
  (E1, E13).
- Default screencast reorders and can lose the final frame (E12).

**Recommendation:** four pieces. Everything else stays: the one FIFO in arrival
order, `quiet`, views, scroll, sinks.

1. **Frames:** `Page.startScreencast` with `maxFramesInFlight: 1,
   sendLastFrame: true`. `CompositorFrame` gains the time it was drawn, from
   `metadata.monotonicTimestamp` (omitted when Chrome doesn't send it).
2. **Input time:**
   - The probe reports `pointerdown` as well as `click`, each with
     `event.timeStamp`. For a keyboard-made click (E10) the first input is the
     Enter/Space `keydown`.
   - The host turns `event.timeStamp` into Chrome's monotonic time with the
     document's `NavigationStart` (one `Performance.getMetrics` per document).
3. **The click rule chooses frames by time, not arrival:**
   - `10` = the newest frame drawn before the interaction's first input.
   - `11` = the newest frame drawn before its end (Q3).
   - A press that never becomes a click is dropped.
   - The rule keeps the few frames that arrived in the last moments, as the
     scroll rule's `recent` already does, because the input's report can arrive
     after frames drawn before it.
4. **Commit by evidence (Q2):** a choice is final once a frame drawn after its
   moment has arrived, or else at the next `quiet`.

**Assumptions:**

- Strict-mode delivery is in order: from the code, and 0 reorders in 2 runs.
- One extra report per click costs nothing measurable. Not measured.

### Q2. Late and out-of-order frames without arbitrary timing

**Facts:**

- Reordering comes from parallel encodes, and frame loss from the default drop
  policy (E12, source).
- In strict mode: 0 reorders, lateness max 47–53 ms (E13).
- Probe reports of inputs arrive 0.1–12 ms after the event (one 50 ms outlier;
  E1).

**Recommendation, in order of preference:**

1. **Remove the causes at the source:** strict screencast. Frames then arrive
   in production order and the newest one is never dropped.
2. **Place by clock:** compare `monotonicTimestamp` with the input's bridged
   time; never compare arrival.
3. **Commit by evidence, not by waiting:** with in-order delivery, the arrival
   of a frame drawn after moment T proves that every frame drawn before T has
   arrived. No timeout is involved.
4. **The one remaining time bound:** if the screen doesn't change after T, no
   proving frame comes. Commit at the next `quiet` (250 ms after the last
   event). This bounds *how long we wait for frames in transit*; it never
   decides *what the interaction was*. Measured lateness in strict mode (≤ 53 ms)
   is well inside it; in default mode it was not (369 ms).

**Assumptions:**

- In-order delivery holds beyond 2 runs, and in the extension host.
- No frame is in transit for longer than 250 ms in strict mode (2 of 48
  openings had unexplained gaps; E13).

**Option for the user:** record which way a choice was committed (by a later
frame or by `quiet`), so that a violated assumption shows up in the data
instead of a silently wrong picture.

### Q3. How to know an interaction has finished

**Facts (E15):**

- A 250 ms quiet took the wrong picture in 4 of 6 slow-response variants.
- A request-aware rule fails on timers.
- No page signal says a response is complete.
- On this site there is no background traffic (E16); elsewhere unknown.

**Recommendation:** don't try to detect "finished". **Bound the interaction by
the person's next action:**

- **`11`** = the newest frame drawn before the next input (`pointerdown`,
  `keydown`, a scroll cause), a view change, or the end of the recording.
- It needs no animation or DOM signal, so missing animations or mutations don't
  matter.
- A slow response is in `11` if the person waited for it, and visibly absent if
  they acted before it came. The latter is a finding in its own right.

**Consequences the user should accept or reject:**

- When the next action is a click, `11` of one click and `10` of the next are
  the same moment, so the same picture. (Today `11` is often the *next* press's
  result; E4.)
- `11` can include hover feedback from moving toward the next target: what the
  person saw.
- A click that changes the view keeps today's rule: `11` is the new view's
  first picture, filed under the old view.
- `11` is known only when the person acts next, leaves, or stops.

**Not recommended as `11`:** the 250 ms quiet. If an early-response picture is
wanted later, it is a separate picture named for what it is ("first rest"),
never "finished".

### Q4. What still needs measuring, and what needs deciding

**Needs measurement:**

| # | Question | Why it matters |
| --- | --- | --- |
| M1 | Is strict-mode delivery in order across many runs, and in the extension host (`chrome.debugger`)? Are `maxFramesInFlight` / `sendLastFrame` accepted there? | Q2's commit-by-evidence depends on it |
| M2 | Cost of strict mode on heavy pages (frame rate, CPU); how often `sendLastFrame` skips the frame that would have been `10` when the screen was moving at the input | Correctness of `10` while things move |
| M3 | Cause of the remaining gaps (E3, E13) | Whether the `quiet` fallback in Q2 is ever wrong |
| M4 | Keyboard-made clicks: is the first input the Enter/Space `keydown`, and is `detail === 0`? | Interaction start for keyboard users |
| M5 | A real person: press length; a `pointerdown` on one element ending in a `click` on another; drag; press-and-hold | Pairing a press with its click |
| M6 | `NavigationStart` per document in the extension host; back/forward-cache restores (no lifecycle events) | The input-time bridge |

**Needs a decision (no measurement settles it):**

| # | Decision |
| --- | --- |
| D1 | What `11` means: "the screen when the person acted next" (recommended) or something else. A product question (E15) |
| D2 | Whether `quiet` may serve as the commit fallback in Q2 (it bounds waiting, not meaning) |
| D3 | Require Chrome ≥ 156, or fall back to the page wall clock (E14) or to today's behavior on older Chrome |
| D4 | Store the shared picture of `11`(n) and `10`(n+1) once or twice |
| D5 | Let the click rule choose by time while the rest of the pipeline keeps arrival order, and say so in the Readme and `domain.ts` |

---

# Part 3 — Proposal: interactions follow the scroll model (2026-10-08)

**The user's direction:** extend the model the scroll rule already uses
(identify a cause, follow the frames it produces, take the pictures when the
visible response comes to rest) to interactions. Don't redesign the recorder
around browser edge cases. One coherent model, not special-case fixes. Where
the frames don't give enough evidence, name the limitation instead of inventing
completion.

- **Supersedes** Part 2's Q3 recommendation. `11` is **not** "the frame before
  the next action".
- **Out of scope:** pointer tracking, semantic DOM analysis, continuous video.

## The scroll model, as built (`packages/rules-interaction/src/scroll.ts`)

1. **Cause.** The probe reports what starts a scroll (`scroll-cause`). A
   position change without a cause is the page re-laid out, not a scroll.
2. **Following.** The page's reports open the scroll, extend it, and take it up
   again after `scrollend`. Frames are placed by time relative to those reports.
3. **Rest.** It is over once the page has said `scrollend` and then nothing for
   `QUIET_AFTER_MS` (250 ms).
4. **Pictures,** both decided once at the end:
   - `03` = the newest frame from before it began, from the `rest`/`recent`
     frames the rule keeps;
   - `04` = the newest frame of the scroll.
5. A scroll's kind is a data field (`cause`); labels stay `03`/`04`.

## The interaction model: the same four parts

### 1. Start: a cause reported by the probe

- **Cause** = the first input of an interaction: a primary-button
  `pointerdown`, or an Enter/Space `keydown` (they make a click; E10). It is
  reported like `scroll-cause`, as `{ kind: 'pointer' | 'key', detail? }`,
  plus the event's own time (`event.timeStamp`).
- **Why not `click`:** measured, the response can come before it (flatpickr
  changes month on `pointerdown`; 29/30 pre-clicks showed the result; E4).
- **Confirmation** = the `click` that follows (today's report, with its target).
  As with scroll, where a cause becomes a scroll only once the page reports
  moving, a cause becomes an interaction only once its click comes. A press
  without a click (drag, text selection, press-and-hold) is not recorded: the
  scope stays clicks, as today.
- A `click` with no cause before it (the page's own `el.click()`, assistive
  tech) is its own cause.

### 2. Following: frames placed by when they were drawn

- Every frame carries when it was drawn: `metadata.monotonicTimestamp`
  (Chrome ≥ 156).
- The cause carries when it happened: `event.timeStamp` plus the document's
  `NavigationStart`. The host reads it once per document with
  `Performance.getMetrics`. It matched to ±0.14 ms (2026-10-06), and agreed
  with the pixels in every hover checked (E1).
- **A frame drawn before the cause** is a candidate for `10` (the newest
  wins). **A frame drawn after it** is part of the response.
- The comparison is by drawn time, never by arrival: arrival picked the wrong
  side for 1–35% of events (E1, E13). The rule keeps the last few frames, as
  scroll's `rest`/`recent` does, because the cause's report can arrive after
  frames drawn after it.
- **Screencast settings:** `maxFramesInFlight: 1, sendLastFrame: true`, so
  frames arrive in the order they were drawn and the newest is never dropped
  (E12, E13).

### 3. Rest: the screen stopped changing

- The screencast sends a frame only when the screen changes. So **the response
  has come to rest once no frame has arrived for `QUIET_AFTER_MS`** after its
  newest frame: the same number and check as scroll's end, the fused stream's
  `quiet`.
- Arrival is good enough for "has it been silent for 250 ms", because in strict
  mode frames arrived at most 53 ms after they were drawn (E13). Drawn time
  still chooses the pictures.
- **A cause while the response is still moving joins it.** Rapid presses
  before the screen rests make one interaction, as a spin of wheel notches is
  one scroll. `10` is before the first, `11` after the last; every click's
  target is kept.
- **An interaction still open at a view change goes on** into the new view, and
  is filed under the view it began in: the existing click carry-over
  (`init(view, previous)`), now ending at rest instead of at the first frame.

### 4. Pictures, decided once at rest

- `10` = the newest frame drawn before the first cause.
- `11` = the newest frame of the response: where it came to rest.
- **Outcomes when the frames can't show a rest.** These are named, never
  invented:

| Outcome | When | Recorded |
| --- | --- | --- |
| rested | the response's frames stopped for 250 ms | `10` and `11` |
| no visible response | no frame drawn after the cause before `quiet` | `10`, and the record says so |
| did not rest | frames still coming at the recording's stop | `10`, and the record says so |

The outcome is a data field on the record, like `cause`. Labels stay `10`/`11`.

## Today / after

| | Today (`click.ts`) | After |
| --- | --- | --- |
| Start | `click` arrives | the cause (`pointerdown`, Enter/Space), confirmed by its `click` |
| `10` | the last frame that **arrived** before the click report | the newest frame **drawn** before the cause |
| `11` | the first frame that **arrived** after the click report | the newest frame of the response once the screen has been still for 250 ms |
| Rapid clicks | one pair per click; `11` often shows the next press (E4) | one interaction until the screen rests |
| Navigating click | `11` = the new view's first frame, filed under the old view | the same, but `11` = where the new view came to rest |
| No rest | – (`11` is always some next frame) | `10` only, with the outcome named |
| Frame delivery | 3 in flight: can reorder and drop the newest (E12) | 1 in flight, newest kept |

## What changes, and what doesn't

| Module | Change |
| --- | --- |
| `stream-compositor` | the two screencast parameters; `CompositorFrame.drawnAtMs` from `monotonicTimestamp` |
| probe (`install.ts`) | report the cause (`pointerdown`, Enter/Space `keydown`) with `event.timeStamp`; the `click` report carries it too |
| `core/wire.ts`, `core/domain.ts` | the cause payload/event (like `ScrollCauseEvent`); the event's own time on interaction events |
| `stream-probe` | per document: `Performance.getMetrics` → `NavigationStart`; turn event times into Chrome's clock |
| `rules-interaction` | `click.ts` becomes an interaction rule built like `scroll.ts` (cause, follow, rest, pictures at the end) |
| Readme, `domain.ts` clocks note | interactions place frames by drawn time; everything else keeps arrival order |
| **unchanged** | engine (`reduce`, views), fused stream and `quiet`, scroll rule, document rules, sinks |

## Limitations: where frames don't give the evidence

**Stated, not worked around:**

1. **A response that comes after a still stretch** (a slow request, a timer):
   the frames rest before it, so `11` shows that rest. The later change has no
   cause the recorder saw and is not part of the interaction, just as a page
   re-laid out is not a scroll. It shows up in the next `10` or the `99`. The
   frames cannot tell "done" from "waiting" (E15: 4 of 6 variants). `11`
   means "where the visible response came to rest", never "finished".
2. **A screen that never stops changing** (spinner, carousel, video):
   no rest, so no `11`. A caret blinking every 500 ms does rest between blinks
   (E6).
3. **Frames don't say where on the screen the change was.** Hover changes from
   moving the pointer after the press, or motion elsewhere on the page, count as
   response until the screen rests.
4. **`sendLastFrame` skips frames under load.** If the screen was changing at
   the press, the true `10` can be skipped and an older one used (E13).
5. **Native popups** (`<select>` menu, datalist suggestions) aren't in frames
   (E8, not confirmed). A response that is only a popup looks like "no visible
   response".
6. **Clicks inside iframes:** `NavigationStart` is the main document's, so an
   iframe event's time would be off by the difference in time origins.
   Not handled.

## Still to measure before building

- Strict screencast in the **extension host** (`chrome.debugger`): are the two
  parameters accepted, and is delivery in order?
- **Per-document `NavigationStart`** in both hosts: is it read before the first
  cause of a document?
- How often a real page **never rests** (limitation 2).
- **A real person's press:** time from press to click, and press on one element
  ending in a click on another.

## For the user to decide

1. Rapid presses before rest join one interaction (as wheel notches join one
   scroll), or each press gets its own pair.
2. An interaction without rest records `10` with the outcome named (proposed),
   or nothing at all (as an unfinished scroll).
3. Chrome ≥ 156 is required (frames need `monotonicTimestamp`).

---

# Part 4 — Prototype: clicks follow the scroll model (2026-10-08)

Built as planned (`~/.claude/plans/harmonic-honking-key.md`), uncommitted. One
deviation: the frame-order guard orders frames by `drawnAtMs` (Chrome's
monotonic clock) only, never by the wall-clock `swapTimeMs`. On Chrome 154 that
stamp is the time Chrome handled the frame, so it follows delivery order
anyway, and a backward system-clock change would drop every frame after it.

## What changed

| Where | What |
| --- | --- |
| probe `clicks.ts` | Reports the **press**: a primary `pointerdown`, or a non-repeating Enter/Space `keydown`. Its `pressId` is a random token per document and frame, plus a count. Clicks carry `pressId`, `trusted` and `eventTimeMs` (`event.timeStamp`). The pairing is cleared after the releasing task (`setTimeout(0)` on `pointerup`, `pointercancel`, `keyup`). |
| `stream-probe` | `Performance.enable`; per own-frame default context, `NavigationStart` from `Performance.getMetrics`, kept only if that context is still the current one when the answer comes. Events get `happenedAtMs` = `NavigationStart` + `eventTimeMs` (Chrome monotonic, ms). Presses pass from any frame. |
| `stream-compositor` | `maxFramesInFlight: 1, sendLastFrame: true`; `drawnAtMs` from `monotonicTimestamp`; a frame drawn before one already passed on is acked, left out and reported (`onOutOfOrder`, default a warning). |
| `rules-interaction/click.ts` | Rewritten on the scroll rule's model: cause (the press), frames placed by drawn time (by arrival where times are missing, and said), rest after 250 ms without frames or clicks, a 2 s cap ("still changing"), shared `11` for quick clicks, both pictures decided at rest. |
| `cli-kit`, recorder | `UXR_CHROME_EXECUTABLE` picks the Chrome. |
| Readme | Probe, Clocks, a new Clicks section. |

## Automated tests

| Suite | Result |
| --- | --- |
| Unit (`pnpm test`) | 318/318; 19 new click-rule tests, 3 compositor, 9 probe |
| Typecheck (`pnpm typecheck`) | clean |
| Browser, Puppeteer host, Chrome 154 (pinned) | 32/32 (one earlier run 31/32, see F2) |
| Browser, Puppeteer host, CfT 156.0.8078.4 | 32/32 |
| Browser, extension host, Chrome 154 | 13/13 |
| Browser, extension host, CfT 156 | 13/13 |

**New browser tests**, on a still `/calendar` fixture that turns its month on
`pointerdown` (each month a colour, read from the frame's pixels in the page):

- `10` shows the month before the press, and `11` the next month at rest;
- three quick clicks keep three `10`s and share one `11` with the third
  month;
- Enter and Space on a button give paired clicks.

The probe test also checks the press comes first, and the click names it.

**On Chrome 156:**

- No capture said "placed by arrival" in either host. `Performance.getMetrics`
  and `monotonicTimestamp` work through `chrome.debugger` too.
- No frame was left out of order.
- The longest gap between frames in the click test was 105 ms.

**One test changed for a reason outside clicks.** The extension test "a page
that was already open" now ignores a `02-settled` capture. Its click is on the
ticking `/` page, so its `11` now comes at the 2 s cap, and in those 2 s Chrome
repeats `networkAlmostIdle`. By the 2026-10-08 "fix settle" change, that
settles a page attached after its load. Measured: the same 2.5 s wait with no
click gives `00-first, 02-settled, 99`.

## The FU calendar, recorded with the real recorder (CDP input)

Scratch script `fu-validate.mjs`:

- **Recorder and output:** `StreamWatchSession`, so its `PersistenceSink` writes
  the PNGs and NDJSON.
- **Input sequence** on `load.php`:
  - open "Tag";
  - next ×2, 1.2 s apart;
  - next ×3 with presses 150 ms apart;
  - previous;
  - a day.
  - Presses are held 80 ms (40 ms for the quick three).
- **Ground truth:** flatpickr's own month (`fp.currentMonth`/`currentYear`),
  read during the run, and the pictures looked at side by side (contact sheets
  below).

| # | Click | Month before → after (flatpickr) | `10` shows | `11` shows | CfT 156 | Chrome 154 |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | open "Tag" | closed → Oktober 2026 | the form, calendar closed | the calendar fully open (not mid-animation) | ✓ | ✓ |
| 02 | next (slow) | Oktober → November | Oktober | November | ✓ | ✓ |
| 03 | next (slow) | November → Dezember | November | Dezember | ✓ | ✓ |
| 04 | next (quick 1/3) | Dezember → … | Dezember | März 2027, shared by 3 clicks | ✓ | ✓ |
| 05 | next (quick 2/3) | … | Januar 2027 (the screen at its own press) | März 2027, shared | ✓ | ✓ |
| 06 | next (quick 3/3) | … → März 2027 | Februar 2027 (at its own press) | März 2027, shared | ✓ | ✓ |
| 07 | previous | März → Februar 2027 | März | Februar | ✓ | ✓ |
| 08 | click day 15 | Februar open → closed, 15.2.2027 selected | **not recorded** | **not recorded** | F1 | F1 |

Other counts from these runs:

- **Placed by arrival:** 0 of 14 captures on CfT 156; 14 of 14 on Chrome 154, as
  expected, and correct there too. The press is reported before the page's
  response frame arrives, so arrival order is right once the press is the
  cause.
- **"No press was reported":** 0.
- **Frames left out of order:** 0.

Recordings (session scratchpad):
`…/scratchpad/cal/fu-run-3/` (CfT 156) and `…/scratchpad/cal/fu-run-154/`
(Chrome 154); the contact sheets are `fu-run-3-sheet.png` and
`fu-run-154-sheet.png`.

For comparison, the old rule's `10` on these clicks already showed the new
month in 29 of 30 cases (E4).

## Observed failures (not accepted limitations)

- **F1. Picking a day in flatpickr is not recorded.**
  - **What happens:** flatpickr selects on `mousedown` and closes the calendar.
    The `pointerup` lands on the page beneath (`DIV.contents`), so Chrome fires
    **no `click`**: measured, `pointerdown`/`mousedown` on the day span, then
    `pointerup`/`mouseup` on `DIV.contents`, and no `click`.
  - **What the prototype does:** the press is reported, but a press without a
    click is out of the agreed scope, so nothing is captured.
  - **Today's rule** misses it too.
  - **Needs a decision:** this is the most important action on a calendar.
- **F2. One intermittent failure in the browser suite.** In 1 of 6 runs of
  "10 is the screen before the press…" (Puppeteer, Chrome 154, the first full
  suite run), `11` showed the month part-way through its 300 ms animation. It
  did not happen in the 5 runs after, nor on Chrome 156, nor in either FU run.
  - Gap logging was added after it, so its cause is **not confirmed**.
  - It fits a frame stall longer than 250 ms in the middle of the animation
    (seen in E3), which the rule reads as rest: the accepted limitation.
- **F3. A screenshot of the recorded tab ends up in the recording.** This was a
  validation-method error, but it shows a real exposure.
  - **What happened:** my first validation took `Page.captureScreenshot` with a
    `clip` from a second CDP session on the recorded tab.
  - Chrome then sent the recorder's screencast frames at the clip's size: 308×302
    pictures became `10`/`11`, and the `99` was 816×800.
  - **Exposure:** anything else that screenshots the tab during a recording
    (DevTools, another extension) can do the same.
  - The references were therefore taken in a separate, unrecorded browser.

## Accepted v1 limitations, as seen

- **Ticking pages:** on the extension test's ticking page, `11` comes from the
  cap and says "The response to clicking … still changing 2 s after the last
  click".
- **Chrome 154:** clicks are placed by arrival, and say so.
- **Not seen on these pages, not exercised by the FU run:** a response after a
  still stretch longer than 250 ms (E15).

## Not yet validated

- **Real mouse and keyboard:** a guided session run by the user, to be analyzed
  the same way.
- **Touch:** a tap's `click` may come in a later task than its `pointerup`. The
  `setTimeout(0)` that clears the press could then run first, leaving the click
  unpaired: no `10`, and its `11` says "no press was reported".

---

# Part 5 — Click clips (2026-10-08)

Built from the plan (`~/.claude/plans/harmonic-honking-key.md`), uncommitted.
**User decisions:**
- every click gets its own clip, from its `10` to its `11`; quick clicks' clips overlap and end on the shared `11`;
- one video setting for scroll and click clips (`UXR_VIDEO=1`, the panel switch "Video of each scroll and click");
- the page reports a press that ends without a click, with no timer.

## What changed

| Where | What |
| --- | --- |
| probe `clicks.ts` | A press is ended by its own release: a pointer press only by `pointerup`/`pointercancel`, a key press only by its own key's `keyup`. Once that task is over, with no `click` naming the press, the probe reports `press-ended` (once per press). |
| `core` wire/domain, `stream-probe`, `stream-cli` | `PressEndedWirePayload` and `PressEndedEvent`, decoded and passed from any frame, and printed |
| `click.ts` | `Press.claimed` became `Press.state: 'down' \| 'clicked' \| 'ended'`; `press-ended` marks it, and a click can't pair with an ended press. `OpenClick.press` keeps its `pressId`. `end()` clears the press when the recording stops or moves to another tab. The rule returns clip writes; the TEMP DEBUG code is gone. |
| new `click-clip.ts` | A pure diff of the rule's state before and after one event. Clip ids are `click-episode-<pressId>`, or `-v<view>-c<episode>` for a click the page's own code made. |
| wording | `core/clip.ts`, `ClipLogRecord`, clip-webm comments, `cli-kit`, recorder session/CLI, extension (switch label, protocol, journey, recorder, offscreen justification), Readme |

## Two refinements over the plan

Both came from the design critique.

1. **A clip begins once its first picture is final:** when a frame drawn after the screen before the press has arrived. Frames arrive in the order drawn, so the `10` can't change after that.
   - The clip starts exactly on its `10`. The "may start one frame early" limitation is gone.
   - Where nothing changes on screen, **no clip** is made. The plan said a still clip would be kept; this needs no extra "nothing changed" check.
2. **A clip is kept only if its `11` is the last frame written to it.** That happens when a press with no click during the response made the `11` "the screen before that press" while the clip ran on. The clip is then dropped rather than kept under an `11` it doesn't end on.

The fixture's `#vanish` removes itself on `pointerdown`. Hiding it with `display: none` still let Chrome fire a `click` on the common ancestor; flatpickr evidently takes the day out of the DOM.

## Tests

| Suite | Result |
| --- | --- |
| Unit | 336/336, including 15 new click-clip, 2 new click-rule, probe decode and any-frame tests, and an extension recorder click-video test |
| Typecheck | clean |
| Puppeteer, Chrome 154 | 33/34 (see below) |
| Puppeteer, CfT 156 | 34/34 |
| Extension, Chrome 154 and CfT 156 | 13/13 each |

**New browser tests:**
- a click's kept clip runs from its `10` frame to its `11` frame;
- three quick clicks give three clips, each starting at its own `10` and all ending on the shared `11`;
- `#vanish` gives `press-ended` and no click, no capture and no clip;
- a press that became a click reports no `press-ended`;
- "click video (UXR_VIDEO)": a real WebM, trace from the `10`'s frame to the `11`'s, decoded first picture vs `10` and last vs `11` above 20 dB, duration = trace end + 250 ms.

**The one failure is not caused by this change.**
- **Test:** "compositor: keeps PNG frames flowing and reports scroll offsets", on Chrome 154.
- **What it sees:** frames report scroll offset 0 after the page scrolled to 600.
- **Same with Chrome's default screencast settings:** offset 0 in all four runs of a raw comparison, two with and two without `maxFramesInFlight: 1, sendLastFrame: true`.
- **What changed since the morning's 32/32 runs:** an external SAMSUNG 1080p display (scale 1, 60 Hz) is now the main display.
- **On CfT 156** the test passes.

## The FU calendar with video on

Recorder `StreamWatchSession` with `video: true`, CfT 156, CDP input (scratchpad `fu-video.mjs`). Each WebM was decoded in Chrome. Its first picture's PSNR against its `10` PNG and its last against its `11` PNG:

| # | Click | Month (flatpickr) | Video | First vs `10` | Last vs `11` |
| --- | --- | --- | --- | --- | --- |
| 01 | open "Tag" | closed → Oktober 2026 | 29 frames, 0.77 s | 36.0 dB | 35.4 dB |
| 02 | next (slow) | Oktober → November | 16 frames, 0.65 s | 35.4 | 35.4 |
| 03 | next (slow) | November → Dezember | 2 frames, 0.50 s | 35.4 | 35.4 |
| 04 | next (quick 1/3) | Dezember → … | 4 frames, 0.79 s | 35.4 | 35.5 |
| 05 | next (quick 2/3) | … | 3 frames, 0.54 s | 35.5 | 35.5 |
| 06 | next (quick 3/3) | … → März 2027 | 2 frames, 0.40 s | 35.5 | 35.5 |
| 07 | previous | März → Februar 2027 | 2 frames, 0.50 s | 35.5 | 35.5 |
| – | pick day 15 | selected 15.2.2027 | no click, so no capture and no clip (F1) | | |

- **Durations:** each equals the trace's last time plus the 250 ms hold.
- **The check discriminates:** each first picture against its *own `11`* scored lower in every clip, 27.3–33.7 dB against 35.4–36.0 dB for its `10`. The margin is small where only the month grid changes; most of the page is the same in both.
- **Clips 04–06** overlap and end on the same `11`.
- **None was "placed by arrival".**

Recording: `…/scratchpad/cal/fu-video-156/` (PNG, WebM, NDJSON with traces).

## Observed failures

- None in the click clips.
- **The display-dependent compositor test on Chrome 154,** above.

## Known limits (as documented in the Readme)

- A press with no click during a response drops the clip of the click whose `11` it made "the screen before" it.
- Two clicks naming one press (a `<label>` passing its click on) share the first one's clip.
- **Touch (untested):** a tap's `click` may come after the press is reported ended, which leaves it unpaired.
- **Separate finding, not changed here:** `scroll-clip.ts` picks a scroll's early frames by `index` (`f.index > now.start.index`). Index restarts when the compositor is attached again to the same tab, so those frames can be missed or mis-ordered. `click-clip.ts` goes by arrival position instead.

---

## Press splitting — implemented 2026-10-09

This supersedes the shared endings, click confirmation, and overshoot-drop rules
above. A press starts its segment with the target described at press time. The
next independent press ends it and starts the next at the same frame. The last
segment ends after release and 250 ms of visual quiet, or the existing finite
observation limit. A native click adds no segment; a script click is independent.

Screenshots and video now use the same completed frame range. October → November
and November → December stay as two clips, including when the second press never
dispatches a click. Unchanged frames still produce captures without video.

Verification: 355 unit tests, typechecking, package and extension builds, 9 focused
Puppeteer tests each on Chrome 154 and CfT 156, and all 14 extension tests on Chrome
154 passed. Browser coverage includes a disappearing target, script clicks during
a held press, keyboard presses, release-triggered changes, consecutive clips, and
an encoded WebM with matching screenshot endpoints. Exact month assertions use
immediate updates; animated responses are tested separately. The external FU
calendar measurements above were not repeated for this change.

The new-tab orphan investigation, lifecycle `02`, and broader timer/scroll changes
are deferred. The engine's tab handoff and document/scroll rules were not changed.
