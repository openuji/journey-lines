# Privacy profiles

Applications select a bundled profile in their composition root:

```ts
import { attachPrivacy, compilePrivacy } from '@openuji/privacy';
import { dummyProfile } from '@openuji/privacy-profiles';

const program = compilePrivacy(dummyProfile);
const attachment = await attachPrivacy(cdp, program, onDiagnostic);
await attachment.ready;
// Later: await attachment.dispose();
```

`compilePrivacy(profile)` is pure and does no DOM access, context fetching, or
network I/O. It emits plain browser commands. The runtime receives no UJG catalog.
The data-only `@openuji/privacy-profiles` package currently exports `dummyProfile`.
Its loopback fixture has no matching target and completes with zero writes.

## Authoring

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

## Diagnostics and limits

Malformed profiles, missing/duplicate references, cycles, and unsupported locator
constraints throw `PrivacyCompileError` with `diagnostics` containing profile/rule
IDs, status codes, and error levels. No partial program is returned. Unknown
constraints/extensions are rejected, including constraints on context locators.

Runtime diagnostics carry program/profile IDs, rule IDs, status, level, and counts.
Missing, ambiguous, invalid, or unsafe targets warn and skip the rule. Diagnostics
and document state contain no original content or saved originals. Accessible
name computation is transient; the runtime retains no computed names.

Each top-level document receives one pass at readiness. All targets and text
destinations are resolved before any replacement, so one rule cannot invalidate
another rule's name lookup. Later DOM changes, same-document route changes,
iframes, and shadow trees are outside this stage's coverage. Disposal cancels
pending work and future injection without restoration. Credential masking and
recording composition are Stage 3.
