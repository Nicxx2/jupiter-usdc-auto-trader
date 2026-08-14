# v10.2.2 implementation audit

Audit date: 2026-08-14

The complete `docker-compose.yml` was inspected as the runtime source of truth, including the embedded Node controller, RPC configurator, Gateway and n8n supervisors, bootstrap shell, and decoded 52-node n8n workflow.

This audit covers the first public release. It verifies the execution controls, portable storage, Portainer lifecycle documentation, partial-volume fail-closed behavior, and automated release checks shipped in v10.2.2.

## Confirmed runtime and safety behavior

- Only host port 5680 is published. n8n 5678, Gateway 15888, and configurator 8081 remain private.
- PostgreSQL 16, n8n/runner 2.31.6, Node 22 Alpine, Gateway 2.15.1, and Alpine 3.22 are pinned by readable tag and immutable multi-architecture digest.
- Seven project-scoped Docker named volumes provide persistent storage; all 15 persistent mounts use `volume.nocopy: true`, and no fixed host-global container names are used.
- Gateway initialization accepts a genuinely empty volume or a complete existing configuration, but fails closed on partial/non-empty state instead of running defaults over potentially restored wallet/RPC data.
- The n8n permissions initializer applies the UID 1000 ownership/write fix.
- Bootstrap generates workflow ID `JATCommunity1022`, verifies SHA-256 `d9cdd129533546d7c0ab4178eb9cb8a4dd517f55da5be43be930b43c5a677848`, verifies publication, performs the restart request/acknowledgement, and verifies health. Its success marker is written only after that sequence completes, so a late failure remains retryable.
- The production webhook is `jupiter-ntfy-event`, and readiness probes that webhook rather than relying only on `/healthz`.
- Both BUY and SELL execution bodies include whitespace between the nested quote close and outer object close, satisfying the n8n expression parser.
- Controller startup forces `TESTING` and `MASTER OFF`; unresolved persisted submissions become `UNCERTAIN` and engage the safety lock.
- Exact mint, effective topic, fired target, token enabled state, source USDC scenario, AUTO direction, current mode/MASTER, risk caps, current wallet assignment, backup confirmation, balances, SOL reserve, and final quote are rechecked.
- BUY and SELL price calculations match the documented semantics. SELL reuses the validated scenario token amount.
- Price impact is multiplied by 100 before comparison; default impact is 2%, maximum scenario is 500 USDC, SOL reserve is 0.02, slippage is 1%, and burst policy defaults to collapse.
- Automatic Gateway token registration verifies by exact mint and uses a deterministic `AUTO_<prefix>_<suffix>` internal symbol.
- Automatic execution sends the exact per-token assigned wallet to Gateway.
- The Gateway supervisor tracks `START_SERVER=true node dist/index.js`, not a pnpm wrapper.
- The controller creates Ed25519 material, passes Base58 secret material directly to Gateway, displays it once, and keeps the recovery copy in memory for a limited confirmation window. No key is sent to n8n or ntfy.
- The workflow contains no `rules_status`, `confirmed_ready`, or RSI execution gate and does not require the source alert's armed/active state.
- Replay guards, duplicate event IDs, burst suppression, and a single global real-trade lock remain implemented.
- No automatic retry occurs after ambiguous submission.

## Deployment and persistence

- Persistent storage uses seven automatically created, project-scoped named volumes.
- The Compose file defines a stable default project name while preserving Portainer/CLI override precedence.
- Services have no fixed host-global container names.
- Documentation includes stopped-stack backup, checksum verification, and clean-host restore guidance.
- Gateway initialization fails closed when a configuration volume is non-empty but incomplete.
- The Compose matrix enforces storage, network, dependency, restart, secret, and published-port invariants.

## Endpoint, topic, and deployment hardening

### One canonical configurable Jupiter Alerts endpoint

The controller and all three embedded n8n source-state nodes use one canonical endpoint without exposing another port or requiring manual n8n changes:

- `APP_API_PORT` supports the Jupiter Alerts application on the same Docker host and defaults to 8000.
- A non-empty complete `APP_API_URL` supports another server and overrides the port setting.
- The controller validates the port/URL at startup.
- The controller exposes a read-only Docker-private `/internal/source-state` proxy.
- All three n8n app-state nodes call that proxy, so initial and final validation always use the controller's same configured source.

The default is `http://host.docker.internal:8000/api/tokens`.

### Canonical effective ntfy topic

Subscription and validation both use the canonical `currentEffectiveTopic()` helper. Exact-mint and current-topic safety checks remain independent requirements.

### Missing secrets fail before deployment

The four persistent secrets now use Compose required-value interpolation. Missing or empty values produce a clear configuration/deployment error rather than allowing containers to receive blank credentials and fail later.

The values must remain stable for the lifetime of an installation.

### Release and reverse-proxy hardening

All six image references include immutable multi-architecture index digests verified for the release, preventing a moving tag from silently changing deployed bits.

`DASHBOARD_COOKIE_SECURE` is a strict optional boolean. When enabled for an HTTPS-only reverse proxy, session and deletion cookies carry `Secure`; it defaults to false so direct trusted-LAN HTTP remains usable. Invalid boolean spellings fail controller startup instead of silently weakening the requested setting.

The release verifier syntax-compiles the embedded controller, configurator, five bootstrap Node snippets, and every n8n Code node; reconstructs and hashes the generated workflow; exercises source URL boundary/rejection cases; checks local documentation links/collapsibles; and enforces the safety and named-volume markers. A separate Compose matrix covers the exact service-to-volume topology/project scoping, network isolation, initializer/health dependency ordering, restart policies, default/custom/remote source configuration, HTTPS-cookie interpolation, published ports, and every missing required secret.

## Input validation for the source endpoint

`APP_API_PORT` accepts only an integer from 1 through 65535.

`APP_API_URL` must use HTTP(S), end in `/api/tokens`, use a valid non-zero port, and must not contain loopback/unspecified hosts (including `.localhost` names), embedded credentials, a fragment, or query parameters. The latter prevents API keys from being placed in a URL that may appear in logs or diagnostics. A private network is preferred; otherwise HTTPS and a source firewall allowlist are recommended because this integration does not add authentication to the source endpoint.

A malformed endpoint prevents the controller from starting and is visible in its logs. A syntactically valid but unreachable endpoint leaves source/readiness checks red and trading unavailable.

## Bootstrap and restart behavior

Bootstrap generates and verifies the expected workflow hash, imports and publishes `JATCommunity1022`, requests the n8n supervisor restart, and verifies the production webhook. Workflow cleanup is limited to the controlled Jupiter Auto Trader name and webhook identity; unrelated n8n workflows are not selected.

Storage uses project-scoped named volumes, so fresh installations require no host paths. Every controller restart forces `TESTING` and `MASTER OFF`.

## Commissioning claim

Repository verification confirms the transaction-path safeguards but does not prove that an on-chain transaction has completed. First-release documentation therefore requires a deliberately tiny verified live trade before an installation is treated as commissioned.
