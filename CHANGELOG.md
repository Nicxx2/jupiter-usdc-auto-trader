# Changelog

Notable release changes are recorded here. Versions follow semantic versioning: safety fixes and compatible deployment improvements increment the patch version; incompatible configuration or behavior changes require a larger increment and explicit migration guidance.

## Unreleased

### Deployment hardening

- Fixed the supervised Gateway startup so the pinned v2.15.1 server explicitly uses HTTP on its private, unpublished Docker network instead of entering an HTTPS certificate crash loop.
- Extended the Gateway startup grace and retry window for slower first installations without delaying a Gateway that becomes healthy sooner.
- Added Compose regression checks that preserve private-HTTP Gateway startup and the hardened health timing.

## [10.2.2] - 2026-08-14

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
