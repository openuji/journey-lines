# Privacy profiles

Applications select a profile through configuration. The recorder CLI and
extension share [packaged defaults](../../apps/extension/Settings.md); the
extension also supports saved overrides in Chrome Options:

```ts
import { createPrivacy, privacyProfileFromDocument } from '@openuji/privacy';

// Load the document selected by application settings.
const profile = privacyProfileFromDocument(JSON.parse(profileDocument));

const privacy = createPrivacy(profile, { onDiagnostic });
const recording = await recordActiveTab(privacy.wrapHost(host), firstTab, {
  sinks: sinks.map((sink) => privacy.wrapCaptureSink(sink)),
  clips: privacy.wrapClipSink(clipSink),
});
const tabSummary = privacy.sanitizeLocation({ id: tabId, url, title });
```

The FU booking account header and SSO username are configured; 11 DOM selectors remain pending. See the
[selector handoff](../../apps/extension/privacy/fu/Readme.md). Unfilled slots match nothing
and report incomplete coverage; they provide no visual protection yet.

For standalone injection without recording:

```ts
import { attachPrivacy, compilePrivacy } from '@openuji/privacy';

const program = compilePrivacy(profile); // Supplied by the caller.
const attachment = await attachPrivacy(cdp, program, onDiagnostic);
await attachment.ready;
// Later: await attachment.dispose();
```

`compilePrivacy(profile)` is pure and does no DOM access, context fetching, or
network I/O. It emits plain browser commands. The runtime receives no UJG catalog.
The [standalone demo's JSON-LD](../../apps/stream-cli/privacy/demo.jsonld)
replaces the loopback fixture's `#identity`. FU data
lives in [the extension JSON-LD document](../../apps/extension/privacy/fu/profiles.jsonld).

## Authoring

`privacyProfileFromDocument(document)` reads a local `UJGDocument` with a stable
`@id`, supported contexts, top-level `nodes`, and the
`extensions["org.openuji.privacy"]` payload. It validates through the same compiler,
rejects unsupported imports, and never fetches contexts. Locators become the
compiler's catalog; the extension payload provides profile settings. The standard
Core context is accepted alongside the legacy aggregate context.

A `PrivacyProfile` has `id`, `version`, `scopes`, `catalog`, and `rules`. Rules
reference scope IDs and a locator IRI. Scope references within one rule are
alternatives. Each scope requires an exact HTTP(S) `origin` and either
`path: { exact: '/account' }` or `path: { prefix: '/account' }`. Prefixes match
the named segment and its descendants, so `/accounting` is excluded. Queries and
fragments do not affect matching. An explicit origin suffix `:*` permits any port
on that exact host; the dummy profile uses it for its ephemeral loopback server.
Other origin wildcards are unsupported.

The catalog is a local JSON-LD `@graph` with `PRIVACY_CATALOG_CONTEXT`. Nodes have
IRI `@id` values and use [UJG Observability](https://ujg.specs.openuji.org/ed/modules/observability)
vocabulary. Actions and scope definitions remain outside that vocabulary.

Supported locators:

- `CustomLocator`: `extensions['org.openuji.privacy.css'] = { selector: '...' }`.
  CSS syntax is checked by Chromium during resolution; invalid selectors warn
  and skip the affected rule.
- `AccessibleLocator`: exact `role`, `accessibleNameRef`,
  `accessibleDescriptionRef`, and conjunctive `contextLocatorRefs`. Computed
  roles, names, descriptions, and accessibility visibility use
  `dom-accessibility-api`. Hidden/inaccessible elements are excluded.
- Contexts must themselves be supported accessible locators. This adapter matches
  strict DOM ancestors, including recursively constrained ancestors. It does not
  implement accessibility-tree reparenting such as `aria-owns`, shadow-root
  traversal, accessible features, or accessible relations.

Names/descriptions reference `MessageMeta` nodes. Each referenced meta needs one
`Message` whose `messageMetaRef` points to it, whose `localeRef` matches the
profile's explicit `localeRef`, and whose `value` is a string. That locale must
exist as a `Locale` node with `localeCode`. No locale or raw-string fallback is
inferred. Use stable interface labels such as “Account holder”, never an actual
participant's identity.

For example, these catalog nodes locate a heading labelled “Account holder”:

```ts
{ '@id': 'urn:privacy:en', '@type': 'Locale', localeCode: 'en' },
{ '@id': 'urn:privacy:holder-label', '@type': 'MessageMeta' },
{ '@id': 'urn:privacy:holder-label.en', '@type': 'Message',
  messageMetaRef: 'urn:privacy:holder-label', localeRef: 'urn:privacy:en',
  value: 'Account holder' },
{ '@id': 'urn:privacy:holder', '@type': 'AccessibleLocator',
  role: 'heading', accessibleNameRef: 'urn:privacy:holder-label' }
```

Set the profile's `localeRef` to `urn:privacy:en` and reference the locator in a rule:

```ts
{ id: 'account.holder', scopeRefs: ['account'], locatorRef: 'urn:privacy:holder',
  replacement: 'Don Joe', text: { kind: 'leaf' } }
```

`text: { kind: 'leaf' }` requires an element without child elements.
`text: { kind: 'direct-text', childNodeIndex: 0 }` changes exactly that immediate
text node. The index counts all `childNodes`, including whitespace and comments;
an absent/non-text node skips the rule. Neither mode reads the previous text or
rewrites a container's contents. Editable elements and their descendants are
excluded. `allowMultiple: true` explicitly permits multiple matching elements;
otherwise exactly one is required. All destinations of a rule must be safe before
any of that rule's writes begin.

Two additional actions are available:

```ts
{ id: 'login.username', scopeRefs: ['login'], locatorRef: 'urn:privacy:username',
  action: 'mask-input' }
{ id: 'account.tooltip', scopeRefs: ['account'], locatorRef: 'urn:privacy:holder',
  action: 'replace-attribute', attribute: 'title', replacement: 'Don Joe' }
```

`mask-input` applies Chromium's `-webkit-text-security: disc` to supported text
inputs and textareas. It never reads or changes their values, types, or names.
Focus, editing, and submission remain functional. Display attributes are limited
to `aria-label`, `title`, `alt`, and `placeholder`; functional attributes such as
`value`, `href`, and `action` cannot be replaced. Accessible name/description
matching rejects candidates whose computation could read editable content.

Optional `metadata` rules transform declared output fields using regular
expressions and literal replacement templates:

```ts
metadata: [{ id: 'account.url', scopeRefs: ['account'], fields: ['url', 'link'],
  pattern: '(/profile/)[^/?#]+', replacement: '$1donjoe' }]
```

Supported fields are `url`, `title`, `text`, `identifier`, and `link`. Rules are
scoped using the original document URL, applied in declaration order, and remain
on the host. Nothing is learned from original DOM text. Capture sinks and clip
`keep` metadata receive copies with the declared transformations; pixels,
timestamps, and clip `frame`/`drop` writes retain their existing contracts.
`sanitizeLocation` covers tab summaries and application URL logging. Engine
navigation inputs and live links remain functional. Profiles must explicitly
cover any sensitive metadata; there is no general identity detector.

## Diagnostics and limits

Malformed profiles, missing/duplicate references, cycles, and unsupported locator
constraints throw `PrivacyCompileError` with `diagnostics` containing profile/rule
IDs, status codes, and error levels. No partial program is returned. Unknown
constraints/extensions are rejected, including constraints on context locators.

Runtime diagnostics carry program/profile IDs, rule IDs, status, level, and counts.
Missing, ambiguous, invalid, or unsafe targets warn and skip the rule. Diagnostics
and document state contain no original content or saved originals. Accessible
name computation is transient; the runtime retains no computed names.

Each document receives one pass at readiness. All targets and text
destinations are resolved before any replacement, so one rule cannot invalidate
another rule's name lookup. Standalone attachment defaults to the top document;
recording composition also installs in accessible document contexts in the
attached CDP session. Unsupported frame contexts report incomplete coverage.
Later DOM changes, same-document route changes, and shadow trees are outside
coverage. Disposal cancels pending work and future injection without restoration.

The recording host waits for replacement and a rendering opportunity. Pending
screencast frames are acknowledged and discarded. Draw timestamps and document
context evidence reject delayed frames from before readiness. Admitted events
keep their timestamps and order. Each readiness wait is bounded to five seconds.
Missing targets, absent profile coverage, unsupported documents, installation
failure, unavailable frame contexts, or missing timing evidence produce warnings
and recording continues with incomplete coverage. This is a best-effort recorder,
not a guarantee that every frame or metadata field is anonymized.

The interaction probe independently excludes editable values and editable
descendant text from element descriptions. It has no dependency on FU profiles.

## Verification

Unit tests cover compilation, safe attribute constraints, metadata copies,
readiness deadlines, delayed frames, navigation races, and cleanup. Chromium
tests exercise both Puppeteer and extension recording, comparing screenshot and
decoded clip pixels against synthetic alias references. They also check stored
and exported metadata, input submission, probe messages, navigation, and tab
switching. Credential checks use typing, CDP bulk insertion, and programmatic
autofill-style assignment; native password-manager autofill and OS clipboard
integration require manual checks. The real FU DOM is awaiting selectors.
