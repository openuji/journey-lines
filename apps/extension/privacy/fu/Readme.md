# FU privacy profile

The extension owns [profiles.jsonld](profiles.jsonld). It is the current default
in [extension settings](../../Settings.md); both recording hosts load their
profile through configuration. Its five
target sites come from the supplied screenshots; selectors must be verified against the DOM before enabling them.

The document uses UJG Core, Surface, Localization, and Observability contexts.
Locators are addressable entries in `nodes`; profile IDs, versions, scopes,
actions, and metadata rules live in `extensions["org.openuji.privacy"]`.
`privacyProfileFromDocument` validates and adapts this local document to the
existing compiler without fetching contexts or importing other documents.
There is no separate TypeScript selector map or generated FU profile.

## FU selector handoff

Fill each `CustomLocator` node's `extensions["org.openuji.privacy.css"].selector`
in [profiles.jsonld](profiles.jsonld) with a verified CSS selector. Every placeholder
currently contains `:not(*)`. This deliberately produces an unmatched rule and
incomplete coverage. URL metadata transformations
are active, but the placeholders do not change page text or mask credentials.

`booking.account` is configured from the supplied DevTools screenshot:
`header.banner .d-flex > p.pb-0.pr-2.h6.align-self-center.font-weight-bold`.
It replaces the leaf paragraph with `Don Joe (donjoe)` and leaves the adjacent
logout link intact. It applies on `/index.php` and the existing `/lernort` scope.

`identity.username` is configured from the SSO DevTools screenshot:
`form[name="login"] input#username[name="j_username"]`.
It visually masks the username on `/idp-fub/*`, including POST and Redirect SSO
routes. The input value, name, type, and form submission remain unchanged.
The remaining 11 slots are still placeholders.

| Site and URL pattern | Selector slot | Intended operation |
|---|---|---|
| `https://raumbuchung.ub.fu-berlin.de/index.php` and `/lernort/*` | `booking.account` | Configured: account display → `Don Joe (donjoe)` |
| `/lernort/view_entry.php?id=…` on the booking site | `booking.owner` | Booking heading → `Don Joe (Privat)` |
| Same booking detail page | `booking.creator` | Creator → `don.joe@example.invalid` |
| Same booking detail page | `booking.modifier` | Modifier → `don.joe@example.invalid` |
| `https://veranstaltung.weiterbildung.fu-berlin.de/Kontakt/<id>.html` | `education.profile` | Profile heading → `Don Joe` |
| Continuing education site | `education.initials` | Account initials → `DJ` |
| `https://my.fu-berlin.de/` | `myfu.account` | Account display → `Don Joe (donjoe)` |
| `https://identity.fu-berlin.de/idp-fub/*` | `identity.username` | Configured: visually mask username input |
| Same identity provider page | `identity.password` | Visually mask password input |
| Identity provider, only if a relevant message exists | `identity.message` | Reserved identity display → `Don Joe` |
| `https://service.fu-berlin.de/servity/*` | `service.account` | Account display → `Don Joe` |
| Service portal | `service.initials` | Avatar initials → `DJ` |
| `https://service.fu-berlin.de/servity/home/<id>` | `service.welcome` | Welcome heading → `Hallo Don Joe, herzlich willkommen!` |

For each slot, provide a selector and whether it matches one element or several.
Text rules currently require a leaf element. If text sits next to nested markup,
provide the direct text-node index (counting all `childNodes`, including whitespace
and comments), so the rule in [profiles.jsonld](profiles.jsonld) can be adjusted without
destroying controls. If the account name and username use separate elements,
provide both selectors; the inventory can be split into separate rules.

The initial page screenshots alone cannot confirm selectors, hidden identity-bearing
attributes, or an identity-provider message. The account header and username input
DOM are visible in the subsequent DevTools screenshots. Identify relevant `aria-label`, `title`, `alt`,
or `placeholder` attributes separately. Remove or narrow inapplicable slots
after inspection rather than hiding missing-target warnings. Do not use an actual
participant's name, username, or credential value in selectors.

URL scopes use exact origins and segment-aware paths; session query values and
participant IDs are not part of scope matching. Output metadata replaces the
education profile ID, service home ID, booking `id` parameter, and identity
provider `execution` parameter with generic values. Session IDs (`JSESSIONID` and
`__Host-JSESSIONID`, including semicolon path parameters) and `execution` values
are replaced with `private` in recorded URLs, links, titles, text, and identifiers.
These rules apply across the configured FU page scopes, including links to SSO
from another covered FU page. They do not change the live address bar, form actions,
hidden CSRF tokens, or submitted values. Other sensitive titles, links,
identifiers, or text need explicit metadata rules after inspection.

See [privacy authoring](../../../../packages/privacy/Readme.md) for supported locators, actions,
composition adapters, and recording coverage limits. Each document receives one
pass; targets rendered or replaced afterward are not covered.
