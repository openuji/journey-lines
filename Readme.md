# Journey Lines

Journey Lines records browser interactions for UX research and turns them into a
timeline with visual evidence. There are two ways to record: a **Chrome
extension** for your own browser tabs, and a **test Chromium instance** launched
through Puppeteer.

Record a task, inspect what happened around each interaction, and use the
screenshots and optional clips to explain the journey.

## What it captures

- Page navigation and document milestones.
- Clicks with element descriptions and before/after screenshots.
- Scrolls with before/after screenshots and their movement path.
- Optional WebM clips for clicks and scrolls.
- An ordered interaction log, with recording following the active tab.

The extension shows the journey live in a side panel. After recording, its report
editor lets you add context, group steps into phases, write findings, and export
the report together with its media.

## Get started

Use **Node.js 22.12 or later** and the pnpm version declared in
[package.json](package.json). Run commands from the repository root.

```sh
pnpm install
```

Installation also downloads Puppeteer's pinned Chrome for Testing and headless
shell. If those downloads were skipped, install them with:

```sh
pnpm exec puppeteer browsers install
```

## Chrome extension

Start the extension development environment:

```sh
pnpm dev:extension
```

This opens Chrome for Testing with the extension loaded and a fresh browser
profile. To open a particular page on launch:

```sh
UXR_START_URL=https://example.com pnpm dev:extension
```

1. Open the page you want to record.
2. Click the **OpenUJI Recorder** extension icon to open its side panel.
3. Enable interaction video if needed, then choose **Record**.
4. Perform the task. The timeline updates as you click, scroll, and navigate.
5. Choose **Stop**, then **Open report** to edit and download the report ZIP.

The interface supports German and English; German is the default. Change the
language, tag suggestions, and privacy-profile selection through the extension's
**Options** page. See [extension settings](apps/extension/Settings.md) for the
configuration details.

Completed recordings currently live in the extension service worker's memory.
Download the report ZIP before reloading the extension or closing the test
browser.

To build an unpacked extension for your own Chrome installation:

```sh
pnpm build:extension
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**,
and select `apps/extension/.output/chrome-mv3`.

## Test Chromium instance

Start a standalone recording session:

```sh
pnpm start https://example.com
```

The recorder launches a separate Chromium-based Chrome for Testing instance with
a temporary profile. Browse normally; recording follows the active tab. Press
**Ctrl+C** in the terminal to finish the session and flush its output.

Each session writes PNG screenshots and `interactions.ndjson` to a timestamped
directory under `recordings/`. Video is off by default. To add WebM interaction
clips:

```sh
UXR_VIDEO=1 pnpm start https://example.com
```

The standalone recorder accepts these environment variables:

| Variable | Purpose |
| --- | --- |
| `UXR_VIDEO=1` | Add clips for clicks and scrolls. |
| `UXR_HEADLESS=1` | Run using Chrome's headless shell. |
| `UXR_CHROME_EXECUTABLE=/path/to/browser` | Override the browser executable. For headless sessions, use a headless-shell binary. |
| `UXR_PRIVACY_PROFILE=/path/to/profile.jsonld` | Select a local privacy profile. Relative paths resolve from the working directory. |

## Reports and privacy

An extension report ZIP contains `report.json`, `interactions.ndjson`, PNG
screenshots, and any recorded WebM clips. To add a downloaded report to the local
journey viewer:

```sh
pnpm journeys:add /path/to/recording.zip
pnpm dev:journeys
```

Open the local URL printed by the development server to browse imported reports.

Privacy behavior comes from explicit site profiles. Coverage depends on the
configured pages, elements, and metadata rules; it does not automatically
anonymize arbitrary websites. See [privacy profiles](packages/privacy/Readme.md)
for authoring, diagnostics, and current coverage limits.

## Development

| Command | Purpose |
| --- | --- |
| `pnpm build` | Build the browser runtimes and TypeScript projects. |
| `pnpm typecheck` | Build and check workspace and test types. |
| `pnpm test` | Run unit tests without launching a browser. |
| `pnpm test:browser` | Build the required extensions and run browser integration tests. |
| `pnpm storybook` | Preview shared UI components. |
| `pnpm storybook:extension` | Preview extension panel states. |

The browser suite exercises both the Puppeteer recorder and the extension.
Extension tests open a visible Chrome for Testing window and need a graphical
display.

## License

Journey Lines is licensed under the **GNU Affero General Public License, version
3 only** (`AGPL-3.0-only`). See [LICENSE](LICENSE) for the full terms.

Third-party components retain their own licenses. The bundled video encoder's
licenses and source information are documented in its
[libav.js notice](packages/clip-webm/vendor/libav/README.md#license).
