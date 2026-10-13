# Privacy fixtures

`two-rule-profile.jsonld` preserves the original username mask and MyFU account
replacement. `two-rule-pages.ts` supplies synthetic pages and expected visible
results for the browser recorder tests.

`metadata-profile.jsonld` preserves the historical profile from commit `7410a62`.
`metadata-cases.ts` keeps its URL, session, capture, and clip examples as test data.
These policies are independent of the editable production profile; they must not
be copied into it to make tests pass.
