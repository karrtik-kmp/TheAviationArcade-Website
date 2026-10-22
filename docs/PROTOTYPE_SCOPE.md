# Prototype scope

This private prototype contains an Airplane Games homepage, a seven-game catalog
and photo collection, photographer proposals, and editorial tools for Aircraft
Identifier and Plane of the Day. Existing branding is retained. Browser gameplay
and app-store release claims are outside this slice.

## Accounts

Firebase email/password and Google are the product sign-in methods. Registration,
password reset, email verification, account controls and logout are implemented.
The outer private Site access gate is separate. Staff requires a verified email
and the server-only `STAFF_EMAILS` allowlist. Local development uses a loopback
Firebase Auth emulator and clearly labeled demo users; those credentials have no
production meaning.

Callsign is the agreed community player name tag. The website does not yet link
to the game principal or claim Callsigns. This remains a required future integration,
not a removed requirement. See [account review](AUTH_FLOW_REVIEW.md).

## Review and publication

Proposals contain photographs, factual details, private contact information,
photographer credit, a rights basis and evidence, a factual source, and proposed
usage channels. Consent authorizes private editorial review; it is not a final
publication license. D1 stores proposals/editorial records; R2 stores private photos.

Approval requires five explicit checks: subject identity, image quality, credit,
rights evidence and category. An approved source can become a separate editorial
draft. Publication rechecks source approval and usage offers. Aircraft Identifier
requires games use; Plane of the Day requires both Plane of the Day and
website/gallery offers. Approval alone does not publish. Demo samples cannot publish.

## Remaining boundaries

This is not a public launch. Real game-account linkage, progress migration, game
content delivery, payments, capability roles/MFA, final publishing rights and a
retention/deletion workflow remain separate work. Public uploads need the hardening
recorded in [security review](SECURITY_REVIEW.md).

Use [README.md](../README.md) for the sole supported source directory, two-terminal
local startup, demo users, verification commands and development guidelines.
