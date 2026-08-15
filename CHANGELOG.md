# Changelog

Notable release changes are recorded here. Versions follow semantic versioning: safety fixes and compatible deployment improvements increment the patch version; incompatible configuration or behavior changes require a larger increment and explicit migration guidance.

## [10.2.5] - 2026-08-15

### Mobile automation card alignment

- Grouped each trading-wallet selector with its assignment status so both remain in the value column of a labelled mobile card.
- Grouped AUTO BUY and AUTO SELL into consistent rows, with a missing-target note directly beneath the corresponding disabled control instead of being placed by the parent card grid.
- Kept control names, submitted values, disabled-target gates, desktop behavior, and the existing responsive breakpoints unchanged.
- Extended the responsive regression test to lock the wallet and automation grouping structure and missing-target note styling.

The embedded 52-node `JATCommunity1022` workflow, transaction routes, persistent state schemas, authentication, wallet data, and trading decisions are unchanged in this presentation-only patch.

## [10.2.4] - 2026-08-15

### Responsive dashboard and device usability

- Added viewport-based responsive layouts without user-agent detection or a separate mobile application; the existing desktop presentation remains the baseline.
- Converted the information-rich Coins / Automation and Recent Trades tables into labelled mobile cards below the narrow-screen breakpoint while preserving exact mints, targets, topics, wallet assignments, AUTO controls, statuses, and signatures.
- Kept one single authoritative form control for every wallet, AUTO direction, mode, MASTER, and confirmation action so responsive presentation cannot introduce duplicated or hidden submitted values.
- Added single-column phone layouts, touch-sized buttons and fields, visible keyboard focus, safe-area spacing for notches and gesture bars, and bounded wrapping for long mints, topics, wallet names, RPC URLs, timestamps, and signatures.
- Improved mobile input behavior with numeric keyboards for safety values, confirmation-oriented keyboard hints, and appropriate password autocomplete metadata.
- Applied bounded responsive layouts to the dashboard header, TESTING/TRADING and MASTER cards, readiness results, wallets, balances, trigger protection, RPC, safety settings, safety-lock recovery, login, one-time wallet recovery, and Gateway diagnostics.
- Added five responsive safety invariants, bringing the dependency-free suite to 43 tests while retaining all existing transaction, persistence, RPC, Gateway, and n8n workflow coverage.
- Added the local `.codex-remote-attachments/` cache to `.gitignore` so user-supplied review images cannot be committed accidentally.

The embedded 52-node `JATCommunity1022` workflow, transaction routes, persistent state schemas, authentication, and trading decisions are unchanged in this presentation-focused patch.

## [10.2.3] - 2026-08-15

### Edge-case and lifecycle hardening

- Repeated the controller's mode, `MASTER`, safety-lock, source, exact wallet assignment, AUTO direction, risk-cap, recovery-confirmation, balance, replay-guard, and duplicate-event checks immediately before the global lock and transaction submission.
- Readiness and both controller source refreshes now reject empty, malformed, or duplicate full-mint configurations instead of accepting an unusable/first matching row.
- Closed a concurrent replay timing window by checking the persisted alert ID and threshold guard again after all asynchronous validation calls.
- Manual safety-lock recovery can no longer clear the ordinary global lock of a transaction that is still in flight.
- Controller restarts discard the previous point-in-time readiness snapshot instead of displaying stale green checks after an update or dependency restart.
- Extended the controller-to-n8n handoff timeout beyond the complete bounded execution/polling path, avoiding a premature replay while a transaction result is still being resolved.
- Custom and Helius RPC preflight now verifies the Solana mainnet-beta genesis hash as well as a fresh confirmed blockhash with a numeric non-negative integer slot; a devnet/testnet or malformed endpoint cannot satisfy Trading readiness by mistake.
- RPC changes now serialize concurrent requests and require both a fresh Gateway restart acknowledgement and the exact requested endpoint fingerprint, so replacing one custom/Helius endpoint cannot be mistaken for the old provider still being active; trailing-dot hostname aliases cannot bypass the Public-RPC classification.
- Custom RPC diagnostics now redact non-root URL paths as well as credentials and query values, protecting providers that place API keys in the endpoint path.
- Gateway and its RPC configurator now share the Linux `host.docker.internal` alias, so a same-host custom mainnet RPC is preflighted and used through the same address.
- n8n no longer receives an unused Docker-host alias; external source and ntfy access remain centralized in the controller.
- Malformed or structurally invalid controller JSON now stops fail-closed instead of silently replacing durable safety, replay, authentication, trade, or audit state.
- Any runtime failure to persist controller/authentication/trade/guard/replay/audit JSON immediately forces the in-memory controller to `TESTING`, `MASTER OFF`, and a safety lock, then exits for Docker to reload durable state, covering disk-full and read-only-volume failures without continuing on mutated memory.
- Source and ntfy URL validation now rejects trailing-dot localhost aliases; `NTFY_SERVER` also receives strict protocol, credential, query, fragment, port, and loopback validation.
- The ntfy stream now bounds incomplete lines, accepts only bounded string event IDs, and prevents malformed source reset values, Gateway wallet addresses, or wrong-type/non-finite/negative/ambiguous balance values from entering execution decisions or durable safety state.
- Wrapped SOL is mapped to Gateway's native `SOL` balance, and a SOL SELL now requires the exact sale amount plus the configured minimum SOL reserve instead of checking those requirements independently.
- An existing minimum SOL reserve below `0.001 SOL` remains readable for configuration compatibility but cannot qualify for Trading readiness or be saved again; the safer default remains `0.02 SOL`.
- One-time wallet recovery material is no longer retained in the pending-confirmation map after rendering; only a short-lived non-secret confirmation marker remains.
- Routine controller console logs report ntfy subscription counts and decision IDs without printing full topic names, reducing accidental disclosure when logs are shared.
- New admin passwords are bounded to 12–256 characters while existing v10.2.2 passwords remain login-compatible.
- Durable threshold guards are no longer pruned from a transiently incomplete source response; resolved timed guards expire from the reset window captured at the trade attempt, while zero-minute and unresolved/reviewed guards require an explicit reset after review.
- Restart recovery reconstructs a permanent guard if a crash occurred after an unresolved trade record was saved but before its matching guard file write completed.
- Uncertain execution now persists its safety lock before its `UNCERTAIN` status; startup re-locks any unresolved uncertainty, while an explicit clear durably records `REVIEWED` without silently removing the threshold guard.
- Only numeric Gateway status `1` is recorded as `CONFIRMED`, and only when a Base58-shaped Solana transaction signature is also returned; unsigned, type-coerced, or malformed nominal success remains `UNCERTAIN` and locked for review. Final trade/quote numbers and price impact must also be actual finite JSON numbers rather than coercible strings, blanks, or `null`.
- Added bounded Docker `local` logging for every service and explicit graceful-stop windows for PostgreSQL, n8n, its runner, and Gateway.
- The dashboard header now displays the running application version from the same constant used by its machine-readable status, making successful updates easy to confirm.
- Added a dependency-free behavior regression suite that executes the controller, RPC, and n8n Code functions embedded in the deployable Compose, covering endpoint security, persisted state, alert authorization, BUY/SELL quote and final-safety logic, replay guards, numeric limits, balances, RPC fingerprints/redaction, and Solana mainnet preflight.
- Expanded automated checks and recovery documentation for the new runtime, storage, RPC, logging, shutdown, and URL invariants.

The embedded n8n workflow payload remains the audited `JATCommunity1022` workflow because this patch changes controller, RPC preflight, Compose lifecycle, regression tests, and documentation rather than the 52 workflow nodes.

## [10.2.2] - 2026-08-14

### Deployment hardening

- Fixed the supervised Gateway startup so the pinned v2.15.1 server explicitly uses HTTP on its private, unpublished Docker network instead of entering an HTTPS certificate crash loop.
- Extended the Gateway startup grace and retry window for slower first installations without delaying a Gateway that becomes healthy sooner.
- Added Compose regression checks that preserve private-HTTP Gateway startup and the hardened health timing.

### Initial public release

- Self-hosted Jupiter USDC Auto Trader with separate `TESTING`, `TRADING`, and `MASTER` controls.
- Required integration with Jupiter USDC Price Alerts through a configurable same-host port or complete remote URL.
- Guarded Jupiter/Solana execution with exact-mint validation, fresh quotes, per-token wallet assignment, balance and reserve checks, risk caps, replay protection, a global trade lock, and uncertain-transaction handling.
- One-file Docker Compose and Portainer deployment with only dashboard port 5680 published.
- Docker-managed, project-scoped named volumes with `volume.nocopy: true` on every persistent mount.
- Stable default Compose project naming and automatic Portainer volume creation without host paths.
- Stopped-stack backup, SHA-256 verification, and clean-host restore guidance.
- Fail-closed detection of partial/non-empty Gateway configuration volumes.
- Release checks for volume topology, network isolation, dependency ordering, restart policies, secrets, and published ports.
- Workflow identity is `JATCommunity1022` with generated SHA-256 `d9cdd129533546d7c0ab4178eb9cb8a4dd517f55da5be43be930b43c5a677848`.
