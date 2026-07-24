# Local MCP installation

The local server uses MCP stdio. It writes only protocol traffic to stdout and
keeps diagnostics on stderr.

## Install from source

Requirements: Node.js 20 or later and Corepack.

```sh
git clone https://github.com/DionCroft/Gielinor-Companion-MCP.git
cd Gielinor-Companion-MCP
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm build
```

Configure the client to run:

```text
node /absolute/path/to/Gielinor-Companion-MCP/apps/mcp-server/dist/index.js
```

Use an absolute path because MCP clients may launch from another working
directory.

## Install from a release npm archive

The GitHub release workflow attaches the server and dependency archives. After
downloading the archives from the same release, install them together in a
private directory:

```sh
corepack pnpm add ./gielinor-*.tgz
```

The executable becomes `gielinor-companion-mcp`. After the package set is
published to npm, the equivalent client command is:

```sh
npx -y @gielinor/mcp-server@1.0.0
```

Verify archive or installer integrity using
[the release-integrity guide](../security/release-integrity.md).

## Configuration

The default database is `~/.gielinor-companion/gielinor.db`.

```text
GIELINOR_DB_PATH=/absolute/private/path/gielinor.db
GIELINOR_USER_AGENT=Gielinor-Companion-MCP/1.0.0 (contact: you@example.com)
GIELINOR_OFFLINE=false
```

Set environment variables in the MCP client configuration, not in a committed
project file. `GIELINOR_OFFLINE=true` permits deterministic/local operations and
retained cache reads but prevents provider network refreshes.

## Smoke check

```sh
corepack pnpm test:mcp
corepack pnpm smoke:clean-install
```

The clean-install smoke packs the seven public workspace packages, installs
them in an isolated operating-system temporary directory (preferring the local
pnpm cache), launches the packed CLI in offline companion mode, and verifies
all 48 stable tools.
