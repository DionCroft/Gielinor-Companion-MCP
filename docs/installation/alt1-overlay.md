# Optional Alt1 overlay

The Version 0.8 overlay is a separate, optional RuneScape 3 web app. The local
MCP server, hosted server, desktop dashboard, quest planner, and every
deterministic feature continue to work without Alt1.

## Safety boundary

The overlay:

- starts disabled and reads nothing until the player selects fields, accepts the
  read-only notice, loads a guide, and presses **Connect**;
- requests Alt1's `pixel` and `overlay` permissions only;
- uses pixels only to locate and OCR the visible main chat area;
- processes text locally under a `connect-src 'none'` content-security policy;
- stores field preferences and guidance-pack facts, never raw captured text;
- displays unclickable advice and never clicks, types, moves, activates an
  ability, trades, or changes the RuneScape client;
- treats completion text as a suggestion requiring player confirmation.

Alt1 is a community tool, not a Jagex product. Jagex says prohibited software
includes software that generates game input, modifies the client, intercepts
communications, or performs gameplay for the player. This app implements none
of those capabilities. Third-party software is still used at the player's own
risk; review the current [Jagex rules](https://legal.jagex.com/docs/rules) and
[Alt1 permissions guide](https://runeapps.org/apps/alt1/help_alt1) before use.

## Requirements

- Windows (Alt1's supported platform)
- Alt1 Toolkit 1.6.0 or later
- A static copy of the overlay built from this repository

The JavaScript dependency is pinned to the audited `alt1` package version
`0.1.3`. The runtime rejects Alt1 versions older than 1.6.0.

## Build

```sh
corepack pnpm install
corepack pnpm --filter @gielinor/alt1-overlay build
```

Serve `apps/alt1-overlay/dist/` as static files from one trusted HTTPS origin.
The repository does not provision a public overlay host. A maintainer can test a
local source build with:

```sh
corepack pnpm --filter @gielinor/alt1-overlay dev --host 127.0.0.1
```

Open the shown loopback URL inside Alt1's browser. For an HTTPS deployment, use:

```text
alt1://addapp/https://your-host.example/appconfig.json
```

Do not install an appconfig from a domain you do not control or trust.

## Use

1. Install/open the app in Alt1.
2. Select only the visible fields you want: quest text, visible dialogue, and/or
   probable completion.
3. Read and accept the runtime notice.
4. Paste a schema-version-1 guidance pack. The included starter shows the
   expected structure.
5. Press **Enable selected fields**, then **Connect read-only overlay**.
6. Grant **Screen pixels** in Alt1. **Overlay** is optional; without it, guidance
   remains in the app window.
7. Use **Pause** or **Disconnect** whenever capture is not wanted.
8. Confirm or dismiss completion suggestions yourself. A confirmation is
   session-local and does not update RuneScape or the companion profile.

Guide packs contain one target quest and 1–50 locally matched steps:

```json
{
  "schemaVersion": 1,
  "targetQuest": {
    "id": "plagues-end",
    "name": "Plague's End",
    "sourceUrl": "https://runescape.wiki/w/Plague%27s_End"
  },
  "steps": [
    {
      "id": "meet-arianwyn",
      "title": "Speak to Arianwyn",
      "keywords": ["Arianwyn", "Prifddinas"],
      "sourceUrl": "https://runescape.wiki/w/Plague%27s_End"
    }
  ]
}
```

## Manual fallback

Open the same app in a normal browser, enable the desired fields, and paste only
the quest/dialogue text you want analysed. No Alt1 permission is required.
Manual mode uses the same redaction, confidence, recommendation, and confirmation
rules. The rest of Gielinor Companion also remains available normally.

## Disable or uninstall

For a temporary stop, press **Pause** or **Disconnect**. For complete local
removal:

1. Press **Revoke and clear** to disconnect and remove this app's stored field
   preferences and guidance pack.
2. Open Alt1 settings.
3. Remove Gielinor Companion from installed apps/bookmarks, or revoke the
   Screen pixels and Overlay permissions for its domain.
4. Remove the static deployment if you operate it.

Revocation clears capture bindings and the named overlay group immediately.

## Troubleshooting

- **Visible chat unavailable:** make the main chat visible and reconnect, or use
  manual mode.
- **Permission required:** install the app for the current domain and enable
  Screen pixels.
- **Unsupported Alt1 version:** install Alt1 1.6.0 or later from the official
  RuneApps site.
- **Text not recognised:** UI scaling, fonts, filters, and RuneScape updates can
  affect OCR. Treat every result as a hint and paste the text manually.
- **False completion:** press **False positive**. No progress was changed.
