# Version 0.9 accessibility audit

Review target: desktop application and optional overlay, WCAG 2.2 AA-oriented
desktop behavior.

## Verified

- semantic main, complementary, navigation, form, status, and alert roles;
- visible skip link targeting the focusable main region;
- accessible names for every audited dashboard button;
- current-page navigation state;
- visible focus style, keyboard-operable native controls, and tab interfaces;
- dark/light/system themes without color-only state labels;
- responsive desktop layouts and explicit text alternatives around icons;
- offline, loading, empty, and provider-failure messages;
- overlay labels, consent controls, pause/disconnect/revoke, and manual fallback.

Testing Library now enforces the desktop landmark/skip-link/button-name
contract. Eleven Playwright journeys continue to cover keyboard-addressable
flows.

## Manual review still required per release platform

- Windows WebView2 at 200% zoom and high contrast;
- macOS VoiceOver where a native build runner is available;
- Linux Orca/WebKitGTK where a native build runner is available;
- final installer screens, which are owned by platform bundlers.

No critical keyboard or semantic blocker was found. Platform assistive-
technology checks remain a Version 1.0 release gate where runners are
available.
