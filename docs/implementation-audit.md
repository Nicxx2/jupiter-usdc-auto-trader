# v10.2.2 implementation audit

Audit date: 2026-08-14

The complete `docker-compose.yml` was inspected as the runtime source of truth, including the embedded Node controller, RPC configurator, Gateway and n8n supervisors, bootstrap shell, and decoded 52-node n8n workflow.

v10.2.2 builds on the v10.2.1 endpoint/topic/security revision with portable storage, Portainer lifecycle documentation, partial-volume fail-closed behavior, and stronger release checks. It does not change BUY/SELL calculations, execution authorization, wallet selection, risk caps, balance requirements, replay handling, or uncertain-transaction behavior.

## Confirmed runtime and safety behavior

- Only host port 5680 is published. n8n 5678, Gateway 15888, and configurator 8081 remain private.
- PostgreSQL 16, n8n/runner 2.31.6, Node 22 Alpine, Gateway 2.15.1, and Alpine 3.22 are pinned by readable tag and immutable multi-architecture digest.
- Seven project-scoped Docker named volumes replace host-specific binds; all 15 persistent mounts use `volume.nocopy: true`, and no fixed host-global container names remain.
- Gateway initialization accepts a genuinely empty volume or a complete existing configuration, but fails closed on partial/non-empty state instead of running defaults over potentially restored wallet/RPC data.
- The n8n permissions initializer retains the UID 1000 ownership/write fix.
- Bootstrap now generates workflow ID `JATCommunity1022`, verifies SHA-256 `fde708e7cd81ca57016a3cb60fa828acfb37f29e08f7e53a2998f3232713e13b`, verifies publication, performs the restart request/acknowledgement, and verifies health. Its success marker is written only after that sequence completes, so a late failure remains retryable.
- The production webhook remains `jupiter-ntfy-event`, and readiness probes that webhook rather than relying only on `/healthz`.
- Both BUY and SELL execution bodies retain whitespace between the nested quote close and outer object close, preserving the n8n expression-parser fix.
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

## v10.2.2 deployment and persistence changes

- Replaced host-specific `/Configs` binds with seven automatically created, project-scoped named volumes.
- Added a stable default Compose project name while preserving Portainer/CLI override precedence.
- Removed fixed host-global container names.
- Added stopped-stack backup, checksum verification, clean-host restore, and legacy migration guidance.
- Added fail-closed detection for partial Gateway configuration volumes.
- Expanded the Compose matrix to enforce storage, network, dependency, restart, secret, and published-port invariants.

## v10.2 findings inherited from v10.2.1

### One canonical configurable Jupiter Alerts endpoint

v10.2 passed `APP_API_URL` to the controller, but three embedded n8n nodes were fixed to `http://host.docker.internal:8000/api/tokens`. A custom endpoint could therefore make controller and workflow validation read different sources.

v10.2.1 resolves this without exposing another port or requiring manual n8n changes:

- `APP_API_PORT` supports the Jupiter Alerts application on the same Docker host and defaults to 8000.
- A non-empty complete `APP_API_URL` supports another server and overrides the port setting.
- The controller validates the port/URL at startup.
- The controller exposes a read-only Docker-private `/internal/source-state` proxy.
- All three n8n app-state nodes call that proxy, so initial and final validation always use the controller's same configured source.

The default remains exactly `http://host.docker.internal:8000/api/tokens`, preserving normal v10.2 deployment behavior.

### Canonical effective ntfy topic

v10.2 subscription refresh preferred `token.ntfy_topic`, while authorization preferred `summary.ntfy_effective_topic`. They normally agree, but conflicting non-empty fields could cause a missed alert.

v10.2.1 uses the existing `currentEffectiveTopic()` helper for subscription and validation. This is an availability/consistency fix; the exact-mint and current-topic safety checks remain unchanged.

### Missing secrets fail before deployment

The four persistent secrets now use Compose required-value interpolation. Missing or empty values produce a clear configuration/deployment error rather than allowing containers to receive blank credentials and fail later.

The values must still remain stable for existing installations.

### Release and reverse-proxy hardening

All six image references include immutable multi-architecture index digests verified for the release, preventing a moving tag from silently changing deployed bits.

`DASHBOARD_COOKIE_SECURE` is a strict optional boolean. When enabled for an HTTPS-only reverse proxy, session and deletion cookies carry `Secure`; it defaults to false so direct trusted-LAN HTTP remains usable. Invalid boolean spellings fail controller startup instead of silently weakening the requested setting.

The release verifier syntax-compiles the embedded controller, configurator, five bootstrap Node snippets, and every n8n Code node; reconstructs and hashes the generated workflow; exercises source URL boundary/rejection cases; checks local documentation links/collapsibles; and enforces the safety and named-volume markers. A separate Compose matrix covers the exact service-to-volume topology/project scoping, network isolation, initializer/health dependency ordering, restart policies, default/custom/remote source configuration, HTTPS-cookie interpolation, published ports, and every missing required secret.

## Input validation for the source endpoint

`APP_API_PORT` accepts only an integer from 1 through 65535.

`APP_API_URL` must use HTTP(S), end in `/api/tokens`, use a valid non-zero port, and must not contain loopback/unspecified hosts (including `.localhost` names), embedded credentials, a fragment, or query parameters. The latter prevents API keys from being placed in a URL that may appear in logs or diagnostics. A private network is preferred; otherwise HTTPS and a source firewall allowlist are recommended because this integration does not add authentication to the source endpoint.

A malformed endpoint prevents the controller from starting and is visible in its logs. A syntactically valid but unreachable endpoint leaves source/readiness checks red and trading unavailable.

## Upgrade behavior

The workflow marker/hash and identity changed for the v10.2.2 release. On an existing v10.2.1 installation, bootstrap detects the new expected hash, unpublishes the prior Jupiter Auto Trader workflow by its controlled name/webhook identity, imports/publishes `JATCommunity1022`, requests the established n8n supervisor restart, and verifies the published production webhook. Unrelated n8n workflows are not selected by ID/name/webhook matching.

The controller state schema is unchanged. Storage now uses project-scoped named volumes, so existing `/Configs` installations require the documented one-time stopped-stack copy before first start of this release; the old directories are not modified automatically. New installations require no host paths. Restart safety still forces `TESTING` and `MASTER OFF`.

## Commissioning claim

Nothing in the repository contents proves that a real transaction has completed on the reference deployment. Documentation continues to require a deliberately tiny verified live transaction before that claim changes.
