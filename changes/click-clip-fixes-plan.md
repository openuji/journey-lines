**Current scope: split by press**

The user narrowed this change on 2026-10-09. Implemented and verified locally.

- A press starts the interaction and carries the target as it was then.
- The next press ends the previous segment and starts the next at the same frame.
- Every release/cancel is reported. The last segment ends after release and visual quiet, with the existing finite observation limit.
- A native click naming the press does not start or confirm a second interaction.
- A script click is an independent action; it cannot claim a physical press.
- Screenshots and video use one selected frame range. Remove shared endings and the overshoot-drop rule.
- Keep the existing 10/11 filenames and the omission of videos for unchanged frames.

Verified consecutive calendar months, a press with no click, delayed boundary frames, keyboard presses, and a held press whose screen changes on release. Checks passed: 355 unit tests, typechecking, builds, 9 focused browser tests each on Chrome 154 and 156, and 14 extension tests on Chrome 154. The calendar test uses immediate month updates to assert exact consecutive months; animated responses remain covered separately.

**Later work, outside this change:** investigate the new-tab orphan issue against the resulting implementation; revisit lifecycle `02` and its extra frame/rest wait; consider broader timer/scroll changes. No changes to the engine's tab handoff or document milestone rules belong in this step.
