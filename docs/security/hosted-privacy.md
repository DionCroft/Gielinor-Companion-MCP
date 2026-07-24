# Hosted privacy and account lifecycle

The hosted service is optional. Local stdio, desktop, and local-model use do not
send a profile to it.

## Stored data

The configured hosted data directory contains:

- `public.db`: public provider cache plus shared quest, training, and Grand
  Exchange snapshots;
- `control.db`: random account UUIDs, SHA-256 access-token digests, account
  state, and timestamps;
- `accounts/<account-uuid>.db`: profiles belonging only to that account.

Raw access tokens, request bodies, RuneScape display names, tool arguments,
provider responses, and profile contents are not written to HTTP logs. Logs
contain a generated request ID, route, method, status, duration, and actor class.

The account token authorizes companion profile data only. It is not a Jagex
credential and must never be a RuneScape password, authenticator code, session
cookie, or launcher token.

## Isolation

An authenticated MCP request opens only the database file derived from the
validated account UUID returned by the token lookup. Account UUIDs come from the
control store; request paths and tool arguments cannot select a storage file.
Anonymous and operator requests use an unavailable profile repository. A
profile UUID from another account therefore returns `NOT_FOUND`.

Public datasets are shared because they contain no private account state.
End-user tokens cannot invoke the three shared refresh tools.

## Export and import

Account export returns schema version 1 and an array of the same strict portable
profile objects used by `export_player_profile`. Local profile/goal UUIDs and
cached Hiscores snapshots are intentionally excluded. Import validates the full
envelope, accepts no more than 20 profiles, and assigns new local UUIDs.

## Deletion

`DELETE /v1/account` first moves the account to a non-authenticating deletion
state, removes its SQLite database and sidecar files, and then removes the
control row. If file removal fails, the service restores the active state and
returns a safe failure rather than claiming deletion succeeded.

Deletion covers only the active service data directory. Operators remain
responsible for backup retention, snapshot deletion, log retention, and legal
obligations outside that directory. Document those policies before offering a
public service.

## Operator responsibilities

- Terminate TLS with a maintained reverse proxy and do not expose the Node port.
- Keep the operator token in a secret manager and rotate it after suspected
  disclosure.
- Leave account creation disabled unless the service is intended to accept new
  users.
- Back up and restore the complete data directory, not selected account files.
- Apply filesystem encryption, restricted service-account permissions, and
  encrypted backups where appropriate.
- Set retention and abuse-response policies and monitor aggregate status codes
  without adding profile content to logs.
- Publish a privacy notice that identifies the operator; this repository cannot
  provide legal advice or a universal notice.
