# Hosted MCP deployment

The hosted service exposes the same 48 validated companion tools over stateless MCP
Streamable HTTP at `/mcp`. The service also exposes liveness, readiness, and
optional private-profile account endpoints. Local stdio and the desktop app
continue to work without this service.

## Security model

- Anonymous callers can use public RuneScape lookups and deterministic
  calculations.
- Private profile tools require an opaque bearer token.
- Each account receives a separate SQLite file. Public quest, training, price,
  and provider-cache data stays in a shared database.
- Shared-data refresh tools require the independent operator token.
- Account creation is disabled by default in production.
- The application enforces host and Origin allowlists, bounded JSON bodies,
  separate request/tool-call rate limits, safe errors, and path-free structured
  logs.
- The Node service does not terminate TLS. Bind it to loopback or a private
  container network and put an HTTPS reverse proxy in front.

The MCP specification recommends Streamable HTTP for remote servers and requires
Origin validation. See the
[MCP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
and the
[TypeScript SDK server guide](https://ts.sdk.modelcontextprotocol.io/server).

## Run from source

Copy the hosted template and set at least the allowed hostname and a randomly
generated operator token:

```sh
cp .env.hosted.example .env.hosted
corepack pnpm install
corepack pnpm build
```

Load `.env.hosted` using your process supervisor or secret manager, then run:

```sh
corepack pnpm start:hosted
```

The default development listener is `127.0.0.1:3333`. Production defaults
require a trusted HTTPS indication and disable account creation.

## Container

The image runs as UID/GID `10001`, drops Linux capabilities, and writes only to
the `/data` volume. Build and start the loopback-bound Compose service:

```sh
docker compose --env-file .env.hosted up --build -d
```

The Compose port is intentionally published only on `127.0.0.1`. Put Nginx,
Caddy, Traefik, or another TLS proxy on the same host. An Nginx example is in
[`deploy/nginx.conf.example`](../../deploy/nginx.conf.example). Replace its
hostname and certificate paths, and make `GIELINOR_ALLOWED_HOSTS` match the
public hostname.

For a direct container deployment, mount durable storage at `/data` and keep the
application port private:

```sh
docker build -t gielinor-companion-mcp:0.8.0 .
docker run --rm \
  --read-only \
  --user 10001:10001 \
  --mount type=volume,src=gielinor-data,dst=/data \
  --publish 127.0.0.1:3333:3333 \
  --env-file .env.hosted \
  gielinor-companion-mcp:0.8.0
```

## Health

- `GET /health/live` confirms the process is serving.
- `GET /health/ready` checks the control and public SQLite stores and reports
  public dataset states.

`never-synced` is a valid initial dataset state, not a storage failure. Populate
the shared catalogues by calling the three refresh tools with
`X-Gielinor-Operator-Token`. Never expose that header to end users.

## Accounts

When account creation is enabled, create an account once:

```sh
curl --fail-with-body \
  -X POST https://mcp.example.com/v1/accounts \
  -H "Content-Type: application/json" \
  --data '{}'
```

The response shows the bearer token once. Store it in a password manager or
secret store. It cannot be recovered because only its SHA-256 digest is kept.

Account operations use `Authorization: Bearer <token>`:

- `GET /v1/account/export` exports all portable profiles.
- `POST /v1/account/import` validates and imports up to 20 portable profiles.
- `DELETE /v1/account` revokes the token and removes the account database.

See [hosted privacy and account lifecycle](../security/hosted-privacy.md).

## Important environment variables

| Variable                             | Production purpose                                      |
| ------------------------------------ | ------------------------------------------------------- |
| `GIELINOR_ALLOWED_HOSTS`             | Comma-separated accepted HTTP Host values               |
| `GIELINOR_ALLOWED_ORIGINS`           | Explicit browser origins; empty is safest               |
| `GIELINOR_TRUST_PROXY`               | Trust forwarded address/protocol only behind your proxy |
| `GIELINOR_REQUIRE_HTTPS`             | Reject requests not marked as HTTPS                     |
| `GIELINOR_OPERATOR_TOKEN`            | Shared-data maintenance secret, 32–256 characters       |
| `GIELINOR_ACCOUNT_CREATION_ENABLED`  | Enables the public account-creation endpoint            |
| `GIELINOR_MAX_REQUEST_BYTES`         | JSON body cap, at most 1 MiB                            |
| `GIELINOR_REQUESTS_PER_MINUTE`       | Per-account or privacy-preserving IP request budget     |
| `GIELINOR_TOOL_CALLS_PER_MINUTE`     | Separate per-actor tool-call budget                     |
| `GIELINOR_HOSTED_REQUEST_TIMEOUT_MS` | Node request timeout, at most 120 seconds               |
| `GIELINOR_HOSTED_DATA_DIR`           | Durable public/control/account storage root             |

Do not set `GIELINOR_TRUST_PROXY=true` when clients can reach the Node listener
directly.
