# Regression tests

These tests protect behavior that must survive future features, refactors, dependency upgrades, and AI-assisted changes.

Run them with Node.js 22 or newer:

```sh
npm test
```

No dependency installation, wallet, RPC key, running container, or network access is required. The suite uses Node's built-in test runner and synthetic/public fixtures only.

## Design

`docker-compose.yml` remains the deployable runtime source of truth. The helpers extract the exact embedded controller and RPC-configurator functions and execute those functions in deterministic test harnesses. Tests do not copy the production logic into a second implementation.

The behavior suite currently protects:

- strict environment booleans and source/ntfy URL boundaries;
- responsive dashboard breakpoints, labelled mobile cards, grouped wallet/AUTO content, touch targets, safe-area handling, and single-copy trading controls;
- bounded recent-alert capture, recognized terminal responses, retry/detail deduplication, stale-processing detection, allowlisted wallet/balance snapshots, safe result normalization, actionable guidance, and compact expandable alert/trade histories;
- Solana mint, wallet, and signature shapes;
- controller, authentication, trade, audit, replay, and trigger-guard persisted schemas;
- n8n alert authorization, BUY/SELL quote math, repeated quote validation, and final safety evaluation;
- price-impact conversion and limits;
- trigger-guard identity, expiry, and explicit-reset requirements;
- fail-closed Gateway balance normalization, including wrong-type and ambiguous keys, plus native SOL mapping/reserve math;
- canonical RPC endpoint fingerprints and diagnostic redaction; and
- Solana mainnet-beta genesis and confirmed-blockhash preflight.

The separate release verifier protects the complete artifact, embedded workflow/hash, safety markers, documentation, images, storage declarations, and published-port boundary. The Compose matrix renders configuration combinations and protects service topology, secrets, dependencies, networks, volumes, lifecycle, logging, and port behavior.

## Change rule

Add or update tests with every deterministic runtime behavior change. A failing regression test is evidence that an established contract changed; do not weaken it solely to make CI green. If the change is intentional, update the implementation, test expectation, changelog, documentation, compatibility explanation, and commissioning guidance together.

Automated tests cannot prove a particular installation's wallet, RPC provider, token route, or live network conditions. Clean-install/restart testing, dashboard **Quick Test Everything**, `TESTING` dry runs, and deliberately tiny live commissioning remain separate required gates.
