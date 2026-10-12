# Tenant privacy in three progressive stages

Each stage is independently runnable and extends the previous one. The first demonstrates browser injection; the second establishes where rules come from; the third integrates privacy into recording through composition.

**For the first stage, injection and execution succeed. The dummy rule deliberately matches nothing and performs no replacement.**

## 1. Browser injection with an unmatched dummy rule

**Deliverable:** a development runner that installs the privacy runtime in a real browser and reports the expected no-op.

### Implementation

- Start `@openuji/privacy` with a browser runtime and a CDP attachment adapter:
  ```ts
  attachPrivacy(cdp, program, onDiagnostic)
  ```
  The returned attachment exposes initial-pass completion and an idempotent `dispose()`.

- Add a standalone `uxr-privacy` command to the existing stream CLI. Reuse its headed-browser launch, navigation, and shutdown harness.

- Supply one literal command from the runner:
  - Rule ID: `demo.missing-name`.
  - Target: `[data-uxr-privacy-demo="absent"]`.
  - Replacement: `Don Joe`.
  - The demonstration fixture deliberately contains no matching element.

- Bundle the browser runtime as an injectable source string, following the existing probe’s build pattern. Give privacy its own installation marker and CDP reporting binding.

- Register the script for new documents with `Page.addScriptToEvaluateOnNewDocument`; execute it in the current document with `Runtime.evaluate`.

- Run once at `DOMContentLoaded`, or immediately when the document is already ready. A document-local completion marker prevents duplicate execution. Runtime state contains rule IDs, completion status, and counts.

- Implement direct text replacement without reading or saving the previous text. Zero matches produce a diagnostic and complete normally.

- Disposal removes future injection, pending readiness listeners, and the reporting binding. It performs no restoration.

### What we should see

```text
privacy installed
rule demo.missing-name: matched=0, overwritten=0
privacy pass completed
```

The browser page stays unchanged. CDP installation failures remain distinguishable from an successfully executed rule that finds nothing.

**Acceptance:** browser tests cover an already loaded document, a subsequently navigated document, duplicate installation, the expected zero-match report, and disposal. This stage runs independently of captures, clips, and tenant configuration.

## 2. The rule environment supplies the same dummy rule

**Deliverable:** the runner obtains its program from a bundled profile, while the injector and its observable behavior remain the same.

**Implemented:** the [demo JSON-LD](../apps/stream-cli/privacy/demo.jsonld) supplies the profile; the runner
compiles it through `compilePrivacy`. See [profile authoring and supported locator
features](../packages/privacy/Readme.md). Compiler/adapter unit tests and the real
Chromium privacy suite cover this stage's acceptance criteria.

### Profile and compilation boundary

Keep declarative profile data with its consuming application. A profile contains:

- A stable ID and version.
- Page scopes based on origin and path.
- A UJG locator catalog.
- Replacement rules referencing locator IDs.
- Literal generic replacements.

Introduce `PrivacyProfile` and a pure `compilePrivacy(profile)` function. Compilation validates supported target definitions and produces the browser command format consumed in stage 1. The runtime receives only the compiled program.

The development runner loads its demo JSON-LD, compiles it, and passes the result to `attachPrivacy`. Recording applications select their profile through settings.

### Target definitions

Use the [UJG Observability module](https://ujg.specs.openuji.org/ed/modules/observability):

- `AccessibleLocator` for stable roles, accessible names, descriptions, and supported context constraints.
- `CustomLocator` with a namespaced extension for CSS targeting.
- Privacy actions belong to the privacy profile and reference those locators. Replacement operations are not presented as UJG Observability vocabulary.

The dummy selector becomes a `CustomLocator` in this catalog. Its compiled command still produces zero matches.

Implement the supported accessible-locator subset using `dom-accessibility-api`. Unsupported locator features produce an explicit diagnostic; they must never result in a broader query. Locator names must describe stable interface labels, not actual participant identities.

### Execution behavior

- Select the page’s applicable rules once.
- Resolve their targets before writing, so one replacement cannot invalidate another rule’s accessible-name lookup.
- Default to exactly one match. A rule can explicitly permit multiple matches.
- Missing or unexpectedly ambiguous targets produce a warning and skip that rule.
- Replace only the declared leaf text or direct text node. Avoid replacing a container’s entire content and destroying its controls.
- Diagnostics contain profile/rule IDs, status codes, and counts—no original content.

**Acceptance:** the bundled dummy profile produces the same no-op as stage 1. Separate synthetic fixtures prove successful replacement, accessible targeting, CSS targeting, page scoping, ambiguity handling, and preservation of nested controls.

## 3. Compose the complete privacy module into recording

**Deliverable:** a bundled FU profile changes covered identity displays in the live browser and recorded output, while credentials remain usable and visually masked.

**Implementation status:** recording composition, credential masking, display
attribute replacement, output metadata transforms, and readiness coordination
are implemented for the extension and Puppeteer hosts. Synthetic browser tests
verify page, screenshot, encoded clip, stored metadata, and export behavior.
Credential tests use typing, CDP bulk insertion, and programmatic autofill-style
assignment; native password-manager and OS clipboard behavior remain manual checks.

**FU coverage partial:** the booking account header and SSO username now use selectors
visible in the supplied DevTools screenshots, including the `/index.php` booking page
scope. Recorded session IDs and SSO flow identifiers are redacted without changing
live authentication values. The other 11 selectors remain pending. At the user's request, the five supplied URL targets
have explicit selector placeholders. This includes the Service Portal in addition
to the four sites below. See the [13-slot selector handoff](../apps/extension/privacy/fu/Readme.md).
The user is supplying selectors incrementally; real-site masking still needs
confirmation in the browser. Unfilled slots report incomplete coverage. Stages 1 and 2 above
describe their original no-op acceptance; the current demo profile has since
been changed to target `#identity`, with the absent-target case tested separately.

### Module responsibilities

| Component | Responsibility |
|---|---|
| `@openuji/privacy` | Compile profiles, resolve targets, overwrite displays, mask credentials, coordinate injection, sanitize output metadata |
| `apps/stream-cli/privacy/demo.jsonld` | Bundled demo profile |
| `apps/extension/privacy/fu/profiles.jsonld` | Extension-owned FU scopes, UJG locators, replacement literals, and metadata rules |
| Application composition roots | Load the configured profile and connect privacy adapters to existing host and sink interfaces |
| Recording stack | Continue handling browser events, journey decisions, captures, and clips through its existing contracts |

Expose a composition factory:

```ts
const privacy = createPrivacy(profile, { onDiagnostic });
```

It supplies:

- `wrapHost(host)` — installs privacy when a tab session attaches.
- `wrapCaptureSink(sink)` — sanitizes capture metadata before delivery.
- `wrapClipSink(sink)` — sanitizes metadata carried separately by clip writes.
- `sanitizeLocation(...)` — sanitizes reported URLs and tab titles.

The extension’s `Recorder` gains a generic injectable recording function, defaulting to `recordActiveTab`. Its background composition root supplies the privacy-composed implementation after reading settings at recording start. The recorder CLI composes the same adapters directly. Neither needs tenant-specific branches or imports. Packaged defaults live in `apps/extension/settings.defaults.json`; Chrome Options stores overrides in `chrome.storage.local`. A recording keeps its selected profile until it ends.

### FU profile

Inspect the actual DOM to author locators; screenshots establish the target inventory but cannot establish selectors.

Cover:

- Room booking: account header, booking owner heading, creator and modifier identities.
- Continuing education: profile heading and account initials.
- my.FU: account name and username.
- Identity provider: credential fields and explicitly identified identity-bearing messages.
- Service Portal: account display, avatar initials, and welcome heading.

Use consistent literals such as `Don Joe`, `donjoe`, `DJ`, and `don.joe@example.invalid`. Declare individual text nodes and identity-bearing display attributes explicitly.

### Credentials

Add a `mask-input` action alongside text replacement.

Apply Chromium-compatible visual masking to the targeted controls, preserving their actual values, types, names, focus behavior, and submission behavior. The privacy runtime never reads, replaces, copies, or restores credential values.

The existing interaction probe also needs a general data-minimization fix: element descriptions must never extract editable values, including through an ancestor’s text description. This introduces no dependency on privacy profiles.

### Recording lifecycle

- `wrapHost` attaches through the existing host, installs privacy, and awaits the initial pass before exposing the session to capture sources.
- On subsequent document navigation, the privacy adapter coordinates readiness before admitting that document’s frames. Frames awaiting readiness are acknowledged and discarded immediately.
- Readiness follows replacement and a rendering opportunity. Document identity and available frame draw timestamps reject delayed frames from before readiness; arrival order alone is insufficient.
- Use a bounded five-second readiness wait. Missing coverage, unsupported documents, installation failure, or unavailable timing evidence produce a warning and allow recording to continue, with coverage reported as incomplete.
- Apply rules to accessible document contexts in the attached CDP session. Unsupported frame contexts are reported as uncovered.
- Preserve timestamps and ordering for admitted events. The existing engine continues using source URLs for navigation decisions.

### Recorded metadata and clips

Profiles may also declare replacements for recorded URLs, titles, interaction text, identifiers, and links. Apply those transformations before data reaches stores, exports, panels, or application logging. Live navigation URLs, link destinations, and form actions retain their functional values.

`wrapClipSink` exists because `ClipWrite.keep` carries its own capture metadata through a separate output path. It sanitizes that metadata; `frame` and `drop` writes pass through unchanged. Video pixels already reflect browser-side replacement. There is no clip post-processing or encoding change.

### Acceptance

Run browser conformance tests against both extension and Puppeteer hosts:

- Identity aliases appear in the page, screenshots, and clips.
- Synthetic credentials remain masked during typing, paste, autofill, and submission; the submitted values remain correct.
- Saved capture metadata, clip metadata, tab summaries, and exports contain the configured aliases.
- Navigation and tab switching apply the correct profile without repeated passes in the same document.
- Stopping leaves replacements and credential masking in place.
- Missing coverage produces a warning and recording continues.
- Privacy diagnostics and state contain no saved originals.

## Operating assumptions across all stages

Targets are present when the initial ready pass runs and remain stable afterward. Each document receives one pass; there is no `MutationObserver`, polling, or continuous rescan. Later DOM replacement and reintroduced personal data are outside this version’s coverage.

Profiles are versioned and bundled; settings select the profile for each recording. The privacy module keeps no original-value snapshots, identity maps, hidden originals, or restoration mechanism. Its coverage is limited to declared targets and supported recording surfaces.
