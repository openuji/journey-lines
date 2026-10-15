# Localisation through JSON dictionaries and a scoped hook

## Architecture

Keep shared UI messages in the design system, extension messages in the extension, and template wording in journey. Use the same flat English/German JSON dictionary format in each package. Journey remains React-free. Use existing packages and preserve archive, entry, and stored-settings formats.

Replace component wording types, default-text objects, text props, and the composed report catalog with stable message IDs and package-owned English/German JSON dictionaries. Dictionary infrastructure imports no components or domain packages.

## Interfaces and flow

- `TranslationProvider({ language, dir = 'ltr', dictionaries?, children })` supplies immutable locale and catalog values derived from props, with no setters or global locale state. Host dictionaries extend the shared messages for the same language; nested providers inherit the catalogs unless they explicitly extend them.
- `useTranslation()` returns `{ t, language, dir }` from that scope. Components call `t(key, parameters?)` and import no catalogs. The extension selects its JSON dictionaries once in its provider module, used by the entrypoints and story roots.
- A single pure lookup/formatting function implements key fallback, named `{name}` parameters, and JSON `one`/`other` forms selected with `Intl.PluralRules`. Missing languages/messages return the requested key verbatim; missing parameters remain unchanged. Output is plain text.
- Report view and reader establish scopes from their existing locale input. Children read the scope directly. Portaled previews also read it and set HTML language/direction without relay props.
- Sidepanel and Options entrypoints read `loadExtensionLanguage()` once and establish the same provider scope for their controls, event labels, media, and accessibility text. The report adapter reads the same saved preference together with its tag suggestions. Page HTML language/direction and titles follow the resolved scope. Recording connections run independently of preference loading.
- Plain presentation/section helpers accept the shared translator function and default to English. They have no component wording contracts.

## Model and adapters

Keep one template structure and frozen assembled templates. Pure functions use journey's English/German dictionaries both to build templates and to recognize standard labels in saved entries. Maintain one source for each translation, preserve custom labels and authored text, and retain the existing journey-template APIs.

English remains the standalone default; the extension defaults to German. The visible setting is **Extension language**; its persisted key remains `report.language`. It applies to the tracking timeline, recorder controls, Options, and reports. Pages read it when opened or reloaded; saving or restoring settings leaves already-open pages in their current language. Report editor, preview, and download use the same template captured for that page.

Language and report preferences recover independently of privacy validation and malformed tag data. Loading and errors remain visible, with localized UI feedback and original diagnostic details. Strict privacy validation remains in recording and save operations.

The journeys app supplies its own reader locale independently of the extension or archive wording. Recognized standard labels follow the reader locale; custom labels and authored text are preserved. Tags and suggestions are opaque strings, including values that happen to match message IDs. Translate surrounding tag controls, never tag values; add no language metadata to tags.

Enable JSON imports in affected TypeScript configurations and include journey JSON files in its compiled output. Add no dependencies or stored-format changes.

## Verification

- Check dictionary parity, key fallback, unknown languages, named parameters, missing parameters, zero/empty values, and singular/plural counts.
- Check isolated sibling/nested provider scopes, inherited host dictionaries, same-language shared messages, language updates, standalone defaults, and safe plain-text output. Enforce that extension catalogs are imported only by the provider module and hooks take no dictionary arguments.
- Retain English/German rendering, historical/custom label and authored-text preservation, legacy settings, and matching editor/preview/download tests.
- Check English/German recording and completed timelines, recorder controls, status/loading feedback, media labels, and Options. Verify language recovery despite invalid privacy or tags, missing/invalid language defaults, and language changes only after reopening/reloading.
- Read exports in the opposite host locale and preserve authored text, custom labels, and literal tags across editing, archives, and reading.
- Check portaled previews and narrow/wide German/LTR and English/RTL reader layouts.
- Enforce that wording contracts are gone and localisation infrastructure imports no components/domain packages. Run affected typechecks, unit/browser tests, and builds; validate the journeys build with current fixtures if legacy local entries block it.
