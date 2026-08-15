# v10.2.5 implementation audit

Audit date: 2026-08-15

The complete `docker-compose.yml` was inspected as the runtime source of truth, including the embedded Node controller, RPC configurator, Gateway and n8n supervisors, bootstrap shell, and decoded 52-node n8n workflow.

This audit covers the first public release, its v10.2.3 edge-case hardening, the v10.2.4 responsive interface, and the v10.2.5 mobile-card alignment polish. It verifies the execution controls, portable storage, Portainer lifecycle documentation, corrupt/partial-state fail-closed behavior, responsive safety presentation, and automated release checks.

## Confirmed runtime and safety behavior

- Only host port 5680 is published. n8n 5678, Gateway 15888, and configurator 8081 remain private.
- PostgreSQL 16, n8n/runner 2.31.6, Node 22 Alpine, Gateway 2.15.1, and Alpine 3.22 are pinned by readable tag and immutable multi-architecture digest.
- Seven project-scoped Docker named volumes provide persistent storage; all 15 persistent mounts use `volume.nocopy: true`, and no fixed host-global container names are used.
- Every service uses bounded Docker `local` logging (10 MB × 3 files); PostgreSQL has a 60-second graceful-stop window, and n8n/runner/Gateway have 30 seconds.
- Gateway initialization accepts a genuinely empty volume or a complete existing configuration, but fails closed on partial/non-empty state instead of running defaults over potentially restored wallet/RPC data.
- The n8n permissions initializer applies the UID 1000 ownership/write fix.
- Bootstrap generates workflow ID `JATCommunity1022`, verifies SHA-256 `d9cdd129533546d7c0ab4178eb9cb8a4dd517f55da5be43be930b43c5a677848`, verifies publication, performs the restart request/acknowledgement, and verifies health. Its success marker is written only after that sequence completes, so a late failure remains retryable.
- The production webhook is `jupiter-ntfy-event`, and readiness probes that webhook rather than relying only on `/healthz`.
- Both BUY and SELL execution bodies include whitespace between the nested quote close and outer object close, satisfying the n8n expression parser.
- Controller startup forces `TESTING` and `MASTER OFF`; unresolved persisted submissions become `UNCERTAIN`, reconstruct any missing threshold guard, and engage the safety lock. A reviewed manual clear is recorded separately as `REVIEWED`. Existing unreadable or structurally invalid controller JSON stops startup rather than being silently replaced.
- Exact mint, effective topic, fired target, token enabled state, source USDC scenario, AUTO direction, current mode/MASTER, risk caps, current wallet assignment, backup confirmation, balances, SOL reserve, and final quote are rechecked.
- Untrusted ntfy input cannot persist a non-string/oversized event ID or an unbounded partial stream line; malformed source reset values and invalid Gateway wallet identifiers are not written into durable safety state. Wrong-type, non-finite, negative, duplicate-case, or ambiguous Gateway balance entries normalize fail-closed before execution comparisons.
- The wrapped-SOL mint maps to Gateway's native `SOL` balance. A SOL SELL requires `amountIn + minSolReserve` at both controller balance checkpoints, preserving fee/account-operation reserve from the same balance being sold.
- Persisted sub-minimum reserve settings remain load-compatible, but Trading readiness and new safety-setting submissions require `minSolReserve >= 0.001`; the default remains `0.02 SOL`.
- BUY and SELL price calculations match the documented semantics. SELL reuses the validated scenario token amount.
- Price impact is multiplied by 100 before comparison; default impact is 2%, maximum scenario is 500 USDC, SOL reserve is 0.02, slippage is 1%, and burst policy defaults to collapse.
- Automatic Gateway token registration verifies by exact mint and uses a deterministic `AUTO_<prefix>_<suffix>` internal symbol.
- Automatic execution sends the exact per-token assigned wallet to Gateway.
- The Gateway supervisor tracks `START_SERVER=true node dist/index.js --dev`, preserving direct PID control while explicitly selecting HTTP on the private, unpublished Docker network.
- RPC updates are serialized and accepted only after the unique restart request is acknowledged and the live Gateway endpoint fingerprint matches the preflighted URL; an already-running provider of the same class is not sufficient.
- The controller creates Ed25519 material, passes Base58 secret material directly to Gateway, and renders it once in the recovery response. After rendering, only a short-lived non-secret confirmation marker remains in memory; no recovery copy is retained or sent to n8n/ntfy.
- The workflow contains no `rules_status`, `confirmed_ready`, or RSI execution gate and does not require the source alert's armed/active state.
- Replay guards, duplicate event IDs, burst suppression, and a single global real-trade lock remain implemented.
- A transiently incomplete source response cannot prune a durable threshold guard. A resolved timed guard expires from the reset window captured when submission was attempted; zero-minute and unresolved/reviewed guards require an explicit reset after review. Startup reconstructs a permanent guard if a crash split the unresolved trade-record and guard writes.
- After all asynchronous validation, the controller repeats the source, mode, `MASTER`, safety, AUTO, assignment, recovery, cap, balance, persisted-alert-ID, and threshold-guard checks synchronously before acquiring the lock. This closes configuration-change and concurrent-replay timing windows.
- The controller-to-n8n wait exceeds the complete bounded execution/signature-polling path instead of replaying an alert at the previous two-minute boundary.
- A Gateway result is not recorded as `CONFIRMED` unless its status is the numeric value `1` and it also carries a Base58-shaped Solana transaction signature. Final trade/quote amounts and price impact must be actual finite JSON numbers; coercible strings, blanks, `null`, malformed quote identifiers, and invalid effective prices are rejected before submission.
- No automatic retry occurs after ambiguous submission.

## Deployment and persistence

- Persistent storage uses seven automatically created, project-scoped named volumes.
- The Compose file defines a stable default project name while preserving Portainer/CLI override precedence.
- Services have no fixed host-global container names.
- Documentation includes stopped-stack backup, checksum verification, and clean-host restore guidance.
- Container logs are bounded independently of the named volumes, and the docs retain explicit monitoring for `gateway_logs` and the overall Docker data filesystem.
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

The dependency-free Node regression suite extracts and executes the actual controller, configurator, and n8n Code functions embedded in `docker-compose.yml`. It locks down endpoint validation, persisted-state schemas, alert authorization, BUY/SELL quote math, final workflow safety evaluation, trigger-guard expiry and explicit-reset behavior, numeric impact limits, Gateway balance normalization, RPC fingerprints/redaction, and mainnet identity/blockhash preflight without maintaining a second runtime implementation. The release verifier separately syntax-compiles the embedded controller, configurator, five bootstrap Node snippets, and every n8n Code node; reconstructs and hashes the generated workflow; checks local documentation links/collapsibles; and enforces the safety, final-recheck, mainnet-genesis, persistence, shutdown, logging, and named-volume markers. The Compose matrix covers the exact service-to-volume topology/project scoping, network isolation, initializer/health dependency ordering, explicit private-HTTP Gateway startup, hardened Gateway startup timing, graceful-stop windows, bounded logging, restart policies, default/custom/remote source configuration, HTTPS-cookie interpolation, published ports, and every missing required secret.

## Input validation for the source endpoint

`APP_API_PORT` accepts only an integer from 1 through 65535.

`APP_API_URL` must use HTTP(S), end in `/api/tokens`, use a valid non-zero port, and must not contain loopback/unspecified hosts (including `.localhost` names), embedded credentials, a fragment, or query parameters. The latter prevents API keys from being placed in a URL that may appear in logs or diagnostics. A private network is preferred; otherwise HTTPS and a source firewall allowlist are recommended because this integration does not add authentication to the source endpoint.

Trailing-dot localhost aliases are normalized before the loopback decision. `NTFY_SERVER` receives the same loopback protection and must be an unauthenticated HTTP(S) base URL without embedded credentials, a query, or a fragment.

A malformed endpoint prevents the controller from starting and is visible in its logs. A syntactically valid but unreachable endpoint leaves source/readiness checks red and trading unavailable.

## Bootstrap and restart behavior

Bootstrap generates and verifies the expected workflow hash, imports and publishes `JATCommunity1022`, requests the n8n supervisor restart, and verifies the production webhook. Workflow cleanup is limited to the controlled Jupiter Auto Trader name and webhook identity; unrelated n8n workflows are not selected.

Storage uses project-scoped named volumes, so fresh installations require no host paths. Every controller restart forces `TESTING` and `MASTER OFF` and clears the previous point-in-time readiness snapshot. Existing malformed controller state is preserved and reported fail-closed for backup recovery instead of being overwritten with new defaults.

## Solana cluster identity

RPC preflight calls the standard `getGenesisHash` method and requires the known mainnet-beta hash `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`, then requires a fresh confirmed `getLatestBlockhash` response with a Base58-shaped blockhash and numeric non-negative integer slot. Only after both checks pass are the relevant persistent Gateway YAML files replaced and a restart requested. This prevents a valid devnet/testnet or type-coerced/malformed RPC response from being mistaken for a Trading-capable mainnet endpoint.

## Per-installation commissioning

Repository verification confirms the transaction-path safeguards, while real execution also depends on each installation's wallet, RPC provider, token, route, and network conditions. The commissioning guide therefore starts in `TESTING` and calls for a deliberately tiny, verified first live trade before meaningful funds are introduced.

## Responsive interface audit

The desktop-first dashboard remains the baseline. Viewport-based CSS activates labelled card layouts for information-rich coin and trade tables at 1100 pixels and below, covering tablet landscape and other constrained screens; it then applies single-column spacing, touch-sized controls, safe-area insets, 16-pixel mobile form text, and bounded long-value wrapping below 700 pixels, with an additional compact-phone adjustment below 420 pixels. It does not inspect user-agent strings or maintain a separate mobile application.

Each wallet selector, AUTO checkbox, mode control, and confirmation input exists only once in the document. Responsive presentation therefore cannot submit a hidden duplicate value or diverge from the desktop form. Within each mobile coin card, the wallet selector stays grouped with its assignment status and each AUTO direction stays grouped with its own missing-target note. Exact mints, targets, topics, wallet assignments, trade states, and signatures remain visible. Login, one-time recovery, Gateway diagnostics, readiness, wallet, RPC, safety, and safety-lock forms receive the same mobile overflow, focus, keyboard, and touch-target safeguards.

The dependency-free suite contains 43 behavior tests, including responsive invariants for breakpoints, labelled cards, single-copy trading controls, touch sizing, safe-area handling, mobile input hints, and the auxiliary pages. These checks complement manual browser/device inspection; they do not claim that a static test can reproduce every browser's rendering engine.

The n8n payload remains the audited 52-node `JATCommunity1022` workflow with its existing SHA-256 because v10.2.3 changes the controller, configurator preflight, and Compose lifecycle, v10.2.4 adds the responsive presentation, and v10.2.5 aligns related mobile-card content without changing workflow execution behavior.
