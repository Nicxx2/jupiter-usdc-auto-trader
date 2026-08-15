# Security policy

Jupiter USDC Auto Trader can manage signing wallets and submit real Solana transactions. Treat security reports and deployment changes accordingly.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting/security-advisory feature for this repository. Do not open a public issue for a suspected vulnerability involving:

- transaction authorization or replay;
- wallet/private-key handling;
- authentication, CSRF, or internal-service access;
- secret exposure in state, diagnostics, logs, n8n, or ntfy;
- RPC URL/API-key disclosure;
- safety-lock bypasses or automatic retry after uncertain submission; or
- a path that can trade the wrong mint, wallet, amount, direction, or target.

Include the affected release, a minimal reproduction, expected versus actual behavior, and whether any real transaction was submitted. Use redacted test values only. Never include a real private key, recovery key, passphrase, API key, `.env`, encrypted wallet store, or transaction material that would put funds at risk.

If private vulnerability reporting is not enabled, contact the repository owner through a private channel and request a secure reporting path before sharing details.

## Supported version

Security fixes are targeted at the current `v10.2.4` one-Compose baseline unless a newer supported release is published. Infrastructure images are pinned by tag and immutable digest; version or digest upgrades need separate compatibility and commissioning tests.

## Deployment security

- Expose only dashboard port 5680, and only to a trusted network or protected HTTPS endpoint.
- Do not expose n8n 5678, Gateway 15888, or RPC configurator 8081.
- Prefer Tailscale or a properly secured reverse proxy for remote access.
- Set `DASHBOARD_COOKIE_SECURE=true` when dashboard access is exclusively through HTTPS; do not set it for direct HTTP access.
- Change the generated first-run admin password immediately.
- Keep Docker named volumes, backups, and `.env`/Portainer environment values access-restricted. In particular, `controller_data` and `gateway_conf` contain sensitive controller and wallet material.
- Keep the four installation secrets stable and backed up. Do not rotate them as a routine troubleshooting step.
- Use a dedicated low-balance bot wallet and maintain a separate recovery backup.
- Treat ntfy messages as untrusted triggers. Do not remove mint/topic/target/source validation.

## Incident response

If a transaction result is ambiguous, do not retry. Leave `MASTER` off and the safety lock engaged while you inspect the signature, assigned wallet, and on-chain balances. If a secret or private key may have leaked, stop the stack, isolate the host, and move remaining funds using a known-clean wallet and environment.

Do not post diagnostics publicly until they have been reviewed for addresses, RPC endpoints, transaction signatures, and other deployment metadata. The controller is designed to redact RPC secrets and exclude private keys, but operators should still review output before sharing it.
