# Changelog

Notable release changes are recorded here. Versions follow semantic versioning: safety fixes and compatible deployment improvements increment the patch version; incompatible configuration or behavior changes require a larger increment and explicit migration guidance.

## [10.2.2] - 2026-08-14

### Added

- Docker-managed, project-scoped named volumes with `volume.nocopy: true` on every persistent mount.
- Stable default Compose project naming and automatic Portainer volume creation without host paths.
- Stopped-stack backup, SHA-256 verification, clean-host restore, and one-time legacy `/Configs` migration guidance.
- Fail-closed detection of partial/non-empty Gateway configuration volumes.
- Release checks for volume topology, network isolation, dependency ordering, restart policies, secrets, and published ports.

### Changed

- Removed fixed host-global container names.
- Updated controller, diagnostics, workflow identity, workflow release note, security baseline, and documentation to `v10.2.2`.
- Workflow identity is `JATCommunity1022` with generated SHA-256 `fde708e7cd81ca57016a3cb60fa828acfb37f29e08f7e53a2998f3232713e13b`.

### Compatibility

- BUY/SELL calculations, transaction authorization, risk caps, wallet selection, replay behavior, and uncertain-transaction handling are unchanged.
- Existing legacy `/Configs` installations require the documented stopped-stack migration before first start.

## [10.2.1] - 2026-08-14

- Added one canonical configurable Jupiter Alerts endpoint using same-host `APP_API_PORT` or remote `APP_API_URL`.
- Routed all workflow source reads through the controller's Docker-private proxy.
- Corrected canonical effective ntfy-topic selection.
- Made the four persistent secrets fail fast during Compose interpolation.
- Added strict HTTPS secure-cookie configuration and immutable multi-architecture image digests.
- Strengthened deterministic workflow/bootstrap and expression-parser regression verification.
