# Security policy

## Supported versions

Until 1.0, security fixes target the latest released minor version.

## Report a vulnerability

Use GitHub's private security-advisory reporting feature for this repository.
Do not include credentials, RuneScape account data, or unrelated personal data.
If private reporting is unavailable, open a minimal issue asking the maintainers
for a private contact channel without disclosing the vulnerability.

Reports should include affected versions, impact, reproduction steps, and a
suggested mitigation when known. Maintainers should acknowledge reports within
seven days and avoid promising a publication date before triage.

## Data and secrets

Gielinor Companion requires only a public display name. It must never request,
store, or log:

- Jagex account emails or passwords
- launcher credentials or authenticator codes
- session cookies, login tokens, or bank PINs

Unexpected internal errors are converted to stable public messages so MCP results
do not expose local paths or provider internals. Local SQLite files should receive
the same operating-system protections as other user data.

Provider plugins are untrusted outward adapters. The registry applies shared
result schemas, explicit priority, fallback diagnostics, disagreement
preservation, offline eligibility, and health tracking before data reaches core
services. Adding a plugin does not grant filesystem, credential, model, MCP, or
gameplay-input capability.

Optional Ollama and LM Studio support accepts only unauthenticated loopback
endpoints. Runtime URL validation and the Tauri HTTP capability both reject
remote hosts. The project must not request, store, or proxy model-provider API
keys. Model output is untrusted: shared schemas validate tool names, arguments,
and source-stamped results before any call is represented as successful.

The optional hosted service uses random Gielinor-specific bearer tokens, never
Jagex credentials. Only SHA-256 token digests are stored. Private profiles are
split into one SQLite file per validated account UUID; public source data is
shared separately. Logs must not contain tokens, tool arguments, display names,
profile content, provider bodies, local paths, or stack traces.

Production operators must terminate TLS, keep the Node listener private, set
explicit Host values, enable HTTPS enforcement only behind a correctly
configured trusted proxy, protect the operator token, and publish their own
retention/privacy policy. See
[hosted privacy and account lifecycle](docs/security/hosted-privacy.md).

## Acceptable use

This project is a read-only companion and analysis tool. It must not implement or
facilitate mouse/keyboard automation, gameplay scripts, combat or skilling
automation, automated Grand Exchange trades, item buying/selling, client-memory
reading, packet interception, credential capture, CAPTCHA solving, or anti-cheat
bypasses.

The optional Alt1 app is separately installed, disabled by default,
consent-driven, and separable from core operation. It reads only visible
main-chat pixels after a second Connect action, retains no raw capture, denies
outgoing network connections, and can draw only unclickable guidance. Its
adapter must never gain generated input, process/client-memory, packet, socket,
or trading capabilities. See
[overlay privacy and consent](docs/security/overlay-privacy.md).

Dependencies and release artifacts must be reviewed. Desktop updates must be
opt-in and must not silently install untrusted code.

The maintained [threat model](docs/security/threat-model.md),
[audit checklist](docs/security/audit-checklist.md), and
[dependency audit](docs/security/dependency-audit.md) are release inputs.
