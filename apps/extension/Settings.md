# Extension settings

Chrome exposes **Options** from the extension icon's context menu and from
`chrome://extensions` → OpenUJI Recorder → Details. The options page saves
validated recording preferences in `chrome.storage.local`. **Restore defaults**
removes that override.

[settings.defaults.json](settings.defaults.json) supplies the packaged defaults:

```json
{
  "privacy": {
    "profilePath": "privacy/fu/profiles.jsonld"
  },
  "video": {
    "scale": 1
  },
  "report": {
    "language": "de",
    "tags": ["Freie Universität Berlin"]
  }
}
```

**Video scale** controls the dimensions of both click and scroll videos. Enter
any number from `0.1` through `1`: `1` preserves the captured dimensions, while
`0.5` halves width and height. Dimensions are rounded to even pixels for the
encoder. Higher values create larger videos and take longer to process. This
setting applies when interaction video is enabled and is fixed when recording
starts; changes apply to the next recording. The default is `1`, including for
older saved settings without `video.scale`. Restore defaults also returns it to
`1`. CLI videos use the shared default of `1`; extension overrides affect only
extension recordings.

`report.tags` are the default tags: the report editor offers them as one-click
suggestions (one per line in Options). A new report starts with no tags, and a
report keeps only the tags it was given. Tags are literal strings: their values
are never translated and have no language metadata.

**Extension language** selects German or English for the tracking timeline,
recorder controls, Options, and reports. The stored key remains `report.language`
for compatibility. German is the extension default; older saved settings without
this key also use German. Each page reads the language when opened or reloaded.
Saving a different language leaves already-open pages unchanged, including
their report edits and the language of their previews and downloads.

Language recovery does not require a valid privacy profile or valid tag data.
Privacy validation still applies when saving settings and starting a recording.
The journeys app chooses its own reader language, translates recognized standard
labels, and preserves custom labels, authored text, and tag values.

The build copies this file and all `privacy/**/*.jsonld` documents into the
extension. The recording code knows only the settings shape; it has no tenant
import, tenant ID, or tenant path. Add a document under `privacy/`, rebuild, then
select its packaged path in Options or change the default above.

Before each recording, saved settings override the defaults. The selected
document is fetched locally, parsed, and validated before recording attaches to
a tab or emits output. That profile stays fixed for the recording, including
metadata and subsequent tab descriptions. Changes apply to the next recording.
An invalid selection reports an error; it does not silently select another
profile or continue without privacy. Remote profile URLs are not supported.

The recorder CLI reads the same defaults file. Set `UXR_PRIVACY_PROFILE` to a
local JSON-LD path to override it, or pass `privacyProfilePath` to
`StreamWatchSession`. Relative overrides resolve from the working directory;
the default resolves relative to this settings file. Browser storage overrides
apply only to the extension.
