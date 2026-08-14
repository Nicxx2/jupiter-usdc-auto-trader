# Contributing

Changes are welcome, but this repository controls software that can move real funds. Keep reviews small, explicit, and fail-closed.

## Before changing runtime behavior

- Read `docker-compose.yml` in full, including the embedded controller, RPC configurator, Gateway supervisor, n8n bootstrap, and Base64 workflow.
- Preserve pinned money-moving infrastructure versions unless the change is specifically a tested upgrade.
- Preserve the seven project-scoped named-volume mappings, `volume.nocopy` behavior, and documented backup and restore compatibility.
- Do not weaken exact-mint identity, fresh source rechecks, per-token wallet assignment, balance/reserve checks, quote/impact limits, replay guards, the global trade lock, or uncertain-transaction safety lock.
- Do not add Action Readiness, Action Rules, RSI, or similar informational source fields as trading gates.
- Never automatically retry an uncertain submission or silently reduce a trade because funds are insufficient.
- Keep n8n, Gateway, and the RPC configurator Docker-private. Port 5680 is the only normal host-published port.

Open an issue before a material architecture or transaction-semantics change. Explain the threat/failure model, migration behavior, test evidence, and rollback plan.

## Validation

Run:

```sh
node scripts/verify-release.mjs
node scripts/verify-compose-matrix.mjs
```

The static verifier checks the pinned architecture, persistent-volume declarations, published-port boundary, embedded workflow identity/hash, required safety markers, source resolver validation, and the BUY/SELL expression-parser regression. The Compose matrix verifies the exact service-to-volume topology, project scoping, `nocopy`, network isolation, initializer/health dependency ordering, restart policies, default port 8000, custom same-host port, remote full URL, fail-fast required secrets, and the one-port boundary through Docker Compose itself.

Runtime changes need clean-install and restart testing. Transaction-path changes should first pass `TESTING` scenarios. Any live commissioning must use a deliberately tiny amount and a dedicated low-balance wallet, and the evidence must never expose secrets.

## Secrets and fixtures

Use synthetic mints/addresses or clearly public chain data in tests. Do not commit `.env`, private keys, recovery material, RPC keys, wallet stores, n8n keys, database credentials, runner tokens, production state, or raw diagnostics from a real deployment.
