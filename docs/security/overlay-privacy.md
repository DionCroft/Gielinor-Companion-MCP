# Overlay privacy and consent

## Data flow

The optional overlay has no network client. Its production page declares
`connect-src 'none'`, and tests reject `fetch`, `XMLHttpRequest`, or `WebSocket`
use in the Alt1 adapter.

```text
visible RuneScape pixels
        |
        v
Alt1 local capture -> visible main-chat OCR -> redaction -> local matcher
                                                       |
                                                       v
                                      app guidance / unclickable overlay
```

Alt1's chat reader briefly scans visible RuneScape pixels to locate the main chat
interface, then reads that region. Gielinor Companion does not save screenshots
or captured lines. The only browser storage contains selected field preferences
and the player-supplied guidance pack.

## Consent lifecycle

- First run is disabled with every field off.
- Field selection and a policy acknowledgement are both required.
- Enabling consent does not start capture; **Connect** is a separate action.
- Permission and RuneScape-link state are rechecked on every capture tick.
- Revoked pixel permission pauses capture safely.
- Pause/disconnect clears Alt1 capture bindings and the overlay group.
- **Revoke and clear** additionally deletes the app's local preferences and
  in-memory guidance/signals.

## Data minimisation

Captured lines are bounded to 1,000 input characters and 280 display characters.
Before matching or display, the app:

- removes timestamps and control characters;
- rejects private-chat prefixes;
- rejects player-name chat prefixes while allowing known quest/system labels;
- redacts email addresses, URLs, IPv4 addresses, and long token-like values;
- keeps at most 20 redacted signals in memory;
- never serialises raw captured text to storage.

The OCR filter is defence in depth, not a guarantee that every possible personal
message format will be recognised. Keep private chat out of the visible main
chat when using any screen-reading tool.

## No-input guarantee

The Alt1 adapter exposes only:

- capability inspection;
- visible-line reading;
- unclickable text annotation;
- clearing its own capture/overlay state.

It has no gameplay-input, client-memory, process-memory, packet, socket, or
network API. Completion confirmation creates an in-memory
`local-confirmation-only` record; it does not change a companion profile and
cannot affect RuneScape.

## Policy basis

The boundary was reviewed on 2026-07-23 against:

- [Jagex game rules](https://legal.jagex.com/docs/rules);
- [Jagex macro/client feature restrictions](https://legal.jagex.com/docs/rules/macro-and-client-features-not-permitted);
- [Jagex EULA](https://legal.jagex.com/docs/terms/eula);
- [Alt1 security and permissions](https://runeapps.org/alt1);
- [Alt1 API permission reference](https://runeapps.org/apps/alt1/helpoutput.html);
- the upstream [`skillbert/alt1` library](https://github.com/skillbert/alt1).

The implementation stays on the permitted side of the cited technical rules, but
Gielinor Companion cannot grant official approval or guarantee future policy.
Users and maintainers must recheck current terms when policies or APIs change.
