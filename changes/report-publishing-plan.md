# Journeys app: CLI import → overview → read-only report

## Context

The extension's report tab downloads a zip. It holds `report.json` v1 (template, draft, and a recording whose media is named by file) plus the CLI artifacts; see `apps/extension/src/lib/report-archive.ts`.

The next step is a place where these reports collect:
1. A CLI adds a downloaded zip as a journey.
2. An overview page lists the journeys.
3. Each journey opens its report read-only, exactly as the tab's Preview shows it.

The app is a new Astro app. The design system moves out of `apps/extension` into its own package, so that the extension and the app both build on it.

**Your decisions:**
- **Two packages:**
  - `@openuji/journey`: the model, with no React;
  - `@openuji/design-system`: React and CSS.
- **The report is read-only in the app.**
- **An intermediate representation per journey** for search, tagging and later uses.

## Principles this plan holds to

- **Dependencies point down only:** `apps/*` → `design-system` → `journey` → `core`/`rules-*`. No package imports or globs anything from an app.
- **Pure core, IO at the edges:**
  - the projections are pure functions of immutable data: `recordingEvents`, `journeyEntry`, `unzipStored`;
  - only the CLI (fs) and the app's island adapter (fetch) do IO;
  - no shared mutable state anywhere.
- **No mode flags:**
  - read-only is a separate, stateless `ReportReader`, not a `readOnly` branch inside the editor;
  - `ReportDocument` swaps `mode` + `dispatch` for one optional `onEdit`. "Editing without a dispatch" then can't be expressed, and the reader needs no no-op callback.
- **One meaning, one module:**
  - a recording's events come from `recordingEvents`;
  - a journey's title rule lives in `journeyEntry`;
  - the storage layout lives in `journey-store.ts`.
- **Each move is a pure move first.** The extension behaves the same before anything new is added.

## Shape

```
packages/
  journey/          @openuji/journey: isomorphic, tsc --build (like rules-document)
    src/journey-events.ts  recording.ts  format.ts
    src/report-draft.ts  report-template.ts  report-archive.ts (+ unzipStored)
    src/journey-entry.ts       NEW: the intermediate representation
    src/fixtures/              → @openuji/journey/fixtures (precedent: @openuji/cdp/testing)
  design-system/    @openuji/design-system: React + CSS, consumed from source by Vite
    .storybook/                the design system's own Storybook
    src/styles/                tokens · themes/classic · base · Foundations.stories
    src/ui/<Component>/        shared components; new: ReportBar, ReportReader, JourneyList
    src/hooks/  src/lib/read-size-token.ts  src/stories/ (story-only GalleryFrame data)
apps/
  extension/        chrome adapters, report-download, panel views
                    (PanelView, Journey, Idle, Recording, Done, Settings); its own Storybook
  journeys/         Astro 7 + @astrojs/react
    src/lib/journey-store.ts   the storage layout, used by both the CLI and the pages
    src/cli/add-journey.ts     run by Node's built-in type stripping (no extra tsconfig/build)
    public/journeys/<id>/report.zip   the download, unchanged: the source of truth
    public/journeys/<id>/entry.json   JourneyEntry, derived from the zip
```

## Stage 1: extract `@openuji/journey` (a pure move)

- **`git mv` from `apps/extension/src/lib/`:**
  - `journey-events.ts`, `report-draft.ts`, `report-template.ts`, `report-archive.ts`;
  - `journey.ts`, which becomes `format.ts`.
- **Add `.js` to relative imports**, because the package compiles under NodeNext and extends `tsconfig.isomorphic.json`.
- **`recording.ts`** holds the types `RecordingItem`, `RecordingMeta`, `StoredRecording`, `TabSummary` and `EndedBy`:
  - the extension's `protocol.ts` and `recording-store.ts` import them;
  - `MemoryRecordingStore` stays in the extension.
- **`recordingEvents(recording)`** wraps today's inline split in `ReportView` (captures and clips → `journeyEvents`), so the derivation lives in one place.
- **`recordingTitle(meta)`** is `ReportView`'s `titleOf`, moved here.
- **Fixtures move to `src/fixtures/`:**
  - `fixtures.ts`, `campus-journey.ts`, `report-sessions.ts`, `transition-fixture.ts`;
  - `storyClip` and `storyTransitionClip` (from `media.ts`).

  They are data of this package's types, behind a subpath so that the main entry never loads them. Tests and stories in every package import them downward.
- **Wiring:**
  - `package.json` with exports `.` and `./fixtures`;
  - `tsconfig.json` references `core`, `rules-document` and `rules-interaction`;
  - root `tsconfig.json` references the package;
  - entries in `workspace-aliases.ts` and `tsconfig.test.json`.
- **Tests:** the model tests move to `packages/journey/test/`:
  - `journey.test.ts` → `format.test.ts`;
  - `report-archive.test.ts`;
  - the model halves of `journey-events.test.ts` and `report-draft.test.ts`.

## Stage 2: extract `@openuji/design-system` (a pure move)

- **`git mv` into `packages/design-system/src/`:**
  - `styles/`, `hooks/`, `lib/read-size-token.ts`, `ui/css-modules.d.ts`;
  - every component that both consumers need, plus the primitives:
    - Alert, Button, IconButton, StatusBadge, Feedback stories;
    - EditableText, FloatingPreview, Frame*, Clip*, PlaybackToggle, TransitionMedia, TimelineRow;
    - JourneyRow, ReportDocument, ReportView.

  Sibling imports stay valid. Only `../../lib/*` imports change, to `@openuji/journey`.
- **Panel-only views stay in `apps/extension/src/ui/`:** PanelView, Journey, Idle, Recording, Done and Settings. They import from `@openuji/design-system`.
- **`report-download.ts` stays in the extension.** It is a DOM side effect, which belongs to the adapter. Design-system stories use Storybook's `fn()` for `onDownload`.
- **Two Storybooks, each over its own stories:**
  - the design system's is new and holds the moved stories;
  - the extension's `.storybook/` keeps PanelView, and its preview re-exports the design system's (`@openuji/design-system/storybook`, a downward import). There are no cross-app globs.
- **`package.json`:**
  - exports `.` → `src/index.ts`, `./styles.css` and `./storybook`;
  - `react` and `react-dom` 19.3.0 as peers;
  - dependencies on `clsx`, `lucide-react`, `@openuji/core` and `@openuji/journey`;
  - the Storybook devDependencies.
- **`tsconfig.json`:** bundler resolution, `react-jsx`, DOM, strict, `noUncheckedIndexedAccess`. It has no `chrome` types, so the package can't call `chrome.*`.
- **Wiring:**
  - aliases for `@openuji/design-system/styles.css` and `@openuji/design-system`;
  - extension entrypoints import the package's `styles.css`;
  - root scripts `storybook` (design system) and `storybook:extension`;
  - `.gitignore` gets `packages/design-system/storybook-static`.
- **Tests:** the component tests move to `packages/design-system/test/`:
  - `clip-filmstrip.test.ts`;
  - the ReportView and ReportDocument render halves.

  The PanelView cases stay in the extension.

## Stage 3: the intermediate representation and the CLI

**`packages/journey/src/journey-entry.ts`** exports a pure `journeyEntry(report: ReportExport): JourneyEntry`. An entry holds what a reader of the report sees: flat, with the template resolved, hidden steps dropped, no media, and versioned.

```ts
type JourneyEntry = Readonly<{
  version: 1;
  id: string;                      // recording.meta.id
  title: string;                   // written title field, else recordingTitle(meta)
  page: { title: string; url: string };
  startedAtMs: number; endedAtMs: number;
  fields: readonly { id: string; kind: TemplateField['kind']; label: string; text: string }[];   // written ones, template order
  phases: readonly { number: number; title: string; happened: string; problem: string }[];
  steps: readonly { key: string; kind: JourneyEvent['kind']; url: string; atMs: number; note: string; phase?: number }[];
}>;
```

It is built from `recordingEvents` and `reportOutline(draft, events, 'preview')`, so the entry and the reader always agree.

**`unzipStored(bytes)`** is the inverse of `zipStored`:
- it reads the end-of-central-directory record, the central directory and the local headers;
- it accepts the stored method only;
- it gives a clear error on a re-zipped, compressed archive.

**Not built now: search, tags and a re-index command.** `entry.json` is where they plug in.

**`apps/journeys/src/lib/journey-store.ts`** is the storage layout, used by both the CLI and the pages:
- `journeyDir(root, id)`;
- `writeJourney(root, entry, zipBytes)` → `{ updated }`;
- `readEntries(root)`, sorted newest first, which fails loudly on an unknown version.

The id must match `^[\w-]+$`, because the zip is user data and must not escape `root`.

**`apps/journeys/src/cli/add-journey.ts`** reads the zip, then runs `unzipStored` → `readReportArtifacts` (which validates) → `journeyEntry` → `writeJourney`:
- it prints `Added`/`Updated "<title>" → /journeys/<id>/`;
- root script: `"journeys:add": "pnpm run build && node apps/journeys/src/cli/add-journey.ts"`. Node 22 here has `process.features.typescript === 'strip'`. `astro check` typechecks the file with the app.

**Tests:**
- `journey-entry.test.ts`, on the campus fixture: untitled, hidden steps, empty phase;
- an `unzipStored(zipStored(x))` round trip;
- `apps/journeys/test/journey-store.test.ts`: write a campus export into a temp dir, read it back, re-add → updated, reject a bad id.

## Stage 4: read-only report and journey list, as Storybook dummies

Per [storybook-dummy-first]:

- **`ReportDocument`:** `mode` + `dispatch` become `onEdit?: (action: ReportAction) => void`. Present means editing; absent means what a reader sees. `ReportStep` follows.
  - `ReportView` passes `onEdit={mode === 'edit' ? dispatch : undefined}`; it keeps its behavior and its state.
- **`ReportBar` (new):** the bar extracted from `ReportView`, showing title and "duration · events". Actions and the back link come in as children.
- **`ReportReader` (new, stateless):** `{ report: ReportExport | null; error?: string | null; back?: { href; label } }` renders `ReportBar` and `<ReportDocument>` with no `onEdit`. Stories: campus, untitled, empty, loading, error, narrow, dark.
- **`JourneyList` (new, stateless):** `{ journeys: readonly JourneyEntry[]; href: (id) => string }`.
  - It shows a bar ("Journeys · N") and rows with title, subject, start page (`shortUrl`), date (new `formatDate` in `format.ts`), duration (`formatClock`), and step and phase counts.
  - Stories: empty, several, untitled, long texts, narrow, dark.

**⏸ I stop here so you can review in Storybook before the app is wired.**

## Stage 5: the Astro app (thin adapters only)

- **Dependencies:**
  - `astro` 7.3.x, which brings Vite 8 like the extension;
  - `@astrojs/react` 7.0.x, `react`/`react-dom` 19.3.0, and both packages;
  - dev: `@astrojs/check`, `typescript`.
- **`astro.config.ts`:** `react()`, static output, Vite `resolve.alias: workspaceAliases`, `dedupe: ['react', 'react-dom']`.
- **Pages:**
  - `src/layouts/Page.astro`: `data-color-mode="system"` and the design system's `styles.css`.
  - `src/pages/index.astro`: `readEntries` → `<JourneyList>`, server-rendered with no JS.
  - `src/pages/journeys/[id].astro`: `getStaticPaths` from `readEntries`, then `<JourneyReport client:only="react" src=".../report.zip">`.
- **`public/journeys/`:** Astro serves it in dev and copies it into `dist/`, so there is no endpoint code.
- **`src/components/JourneyReport.tsx`** is the only stateful piece, like the extension's `Report.tsx`:
  1. fetch;
  2. `unzipStored`;
  3. `readReportArtifacts`;
  4. `<ReportReader>`.
- **Repo config:**
  - root scripts `dev:journeys` and `build:journeys`;
  - the app's `typecheck` runs `astro check`;
  - `.gitignore` gets `apps/journeys/public/journeys/` and `apps/journeys/.astro`. Imported journeys hold real browsing, so they stay out of git like `recordings/`; committing them is a one-line change.
  - `allowBuilds: sharp: false`, since `sharp` is Astro's optional dependency and we use no image optimization. This avoids the pnpm build-script failure seen with `apps/web`, which stays excluded.

## Verification

- **Stages 1–2:**
  - `pnpm typecheck` and `pnpm test` pass;
  - `pnpm build:extension` builds;
  - `pnpm test:browser` passes;
  - both Storybooks show every existing story;
  - in the built extension, record → report tab → Edit/Preview/Download works as before.
- **Stage 3:**
  - `pnpm journeys:add <zip from the extension>` writes `public/journeys/ses_…/{report.zip,entry.json}`;
  - running it again prints "Updated";
  - a re-zipped archive is rejected with a clear message.
- **Stage 4:** the new stories, including narrow and dark, plus render tests for `ReportReader` and `JourneyList`.
- **Stage 5:**
  - `pnpm dev:journeys` lists the journey;
  - opening it shows the same report as the extension's Preview, with clips playing;
  - `pnpm build:journeys` gives a static `dist/` that behaves the same.

**Afterwards:** update [ui-component-convention] (styles now in the design system) and [report-editor] (file locations), and add a memory for the journeys app and the entry format.
