# Version 1.0 accessibility review

Review date: 2026-07-24. Target: the React/Tauri desktop and optional Alt1
overlay, with WCAG 2.2 AA-oriented desktop behavior.

## Verified

- Semantic main, complementary, navigation, form, status, alert, tab, and
  dialog structures.
- A visible-on-focus skip link targets the focusable main region.
- Every audited dashboard button has an accessible name; current navigation
  exposes `aria-current`.
- Native controls and tabs are keyboard operable with visible focus styles.
- Dark, light, and system themes do not rely on color alone for state.
- Responsive layout, reduced-motion handling, text alternatives around icons,
  and explicit loading, empty, offline, stale, and error messages.
- Overlay consent, field controls, pause, disconnect, revoke, and manual
  fallback are labelled and keyboard operable.

The executable accessibility contract passed in the 15-test desktop DOM suite.
All 11 Playwright user journeys passed in Chromium. The three Version 1
screenshots were manually inspected at 1440×1000 for clipping, hierarchy,
contrast, and readable state labels; no critical blocker was found.

## Platform follow-up

The Windows MSI and NSIS were built successfully, but final installer UI is
owned by the platform bundlers. Manual Windows high-contrast/Narrator, macOS
VoiceOver, and Linux Orca sessions remain recommended before a certificate-
signed mass distribution. Cross-platform CI compiles the native application and
tests the command boundary; it does not replace an assistive-technology session.
