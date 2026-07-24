# UI development guide

The desktop UI is an accessible React client over the same trusted tool
boundary as MCP. The demo bridge supplies deterministic fixtures; the Tauri
bridge supplies the local sidecar.

## Adding a view

1. Add a typed `ViewId` and reducer transition.
2. Add one navigation entry with an original project icon.
3. Build the view from semantic HTML and existing components.
4. Call `CompanionBridge.callTool`; do not duplicate domain calculations.
5. Show loading, empty, stale/offline, success, and actionable failure states.
6. Display source and retrieval timestamps for external data.

## Accessibility requirements

- One main landmark and a working skip link.
- Logical heading order and visible keyboard focus.
- Native buttons, links, labels, fieldsets, and tables before ARIA substitutes.
- Accessible names for icon-only controls.
- `role="status"` for passive updates and `role="alert"` for failures.
- No color-only status signal; preserve contrast in dark and light themes.
- Responsive reflow without horizontal page scrolling at 200% zoom.
- Respect reduced-motion preferences.

Add Testing Library coverage for roles and names, keyboard-focused Playwright
journeys, and a manual keyboard/zoom/contrast note when visual behavior changes.

Run:

```sh
corepack pnpm test:desktop
corepack pnpm test:desktop:e2e
```
