# Troubleshooting

## Start with status, not manual internal configuration

```sh
docker compose config --quiet
docker compose ps
docker compose logs --tail=200 trading-controller
docker compose logs --tail=200 n8n-bootstrap
docker compose logs --tail=200 n8n
docker compose logs --tail=200 gateway
```

Do not work around startup problems by publishing n8n/Gateway ports, manually importing the workflow, or editing Gateway YAML. Those steps bypass the one-Compose lifecycle and can leave the dashboard's readiness model out of sync.

If deployment fails before services can initialize, confirm all four required variables are non-empty, TCP port 5680 is not already allocated, the target is Linux Docker Standalone with Compose v2 rather than Swarm, and the host has free Docker storage plus outbound DNS/HTTPS access. A port conflict must be resolved on the host; do not publish the internal n8n or Gateway ports as a workaround.

A repeated `[persistence]` controller error/restart means a durable JSON write failed. Stop the stack, resolve a full/read-only Docker data store, and preserve the volumes; do not keep restarting or delete state to make the error disappear.

## Dashboard password

On a fresh `controller_data` volume, a random first-run password is printed once in `trading-controller` logs. Sign in at port 5680 and change it. If that volume already contains the controller authentication file, restarting does not create a new first-run password.

Do not delete controller state to reset access on a funded deployment: it also contains replay guards, trade records, wallet-backup confirmations, and safety state.

If the changed password is genuinely lost, stop the entire stack and move **only** `auth.json` inside `controller_data`. Do not move/delete `state.json`, `seen.json`, `trades.json`, `audit.json`, or `trigger-guards.json`. An advanced Docker-host recovery example is:

```sh
set -eu
PROJECT_NAME=jupiter-usdc-auto-trader
# Change PROJECT_NAME if the actual Portainer stack/project name is different.
CONTROLLER_VOLUME="$(docker volume ls \
  --filter "label=com.docker.compose.project=$PROJECT_NAME" \
  --filter 'label=com.docker.compose.volume=controller_data' \
  --format '{{.Name}}')"
test -n "$CONTROLLER_VOLUME"
test "$(printf '%s\n' "$CONTROLLER_VOLUME" | wc -l)" -eq 1
docker run --rm \
  --mount "type=volume,src=$CONTROLLER_VOLUME,dst=/controller-state" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce \
  sh -c 'set -eu; test -f /controller-state/auth.json; mv /controller-state/auth.json "/controller-state/auth.json.recovery.$(date +%s)"'
```

Start the stack, retrieve the newly generated first-run password from `trading-controller` logs, and change it immediately. This creates a new session secret and invalidates old sessions while preserving execution/safety state. Keep the recovery file private until access is confirmed, then dispose of it through your normal secret-handling process.

If login succeeds but immediately returns to the login page, check `DASHBOARD_COOKIE_SECURE`. It must be `true` only when the browser uses HTTPS exclusively; leave it false for direct `http://SERVER-IP:5680` access.

## n8n permission failure

The `n8n-permissions` one-shot service should initialize/chown the `n8n_data` and `bootstrap_data` volumes for UID/GID 1000 before n8n starts.

Check:

```sh
docker compose ps -a n8n-permissions
docker compose logs n8n-permissions
```

Do not remove this initializer. Docker-managed volumes avoid normal host bind-path and SELinux relabeling problems. If ownership still fails, confirm the services have not been changed to bind mounts or forced to a conflicting user, and inspect the Docker storage/daemon error without making the volumes world-writable.

## Bootstrap does not complete

The bootstrap verifies the known workflow, publishes it, asks the n8n supervisor to restart, waits for a matching acknowledgement, and then waits for n8n health. Inspect both `n8n-bootstrap` and `n8n` logs. A healthy n8n container by itself is not sufficient; Quick Test also probes the production webhook.

Do not import another copy manually. Duplicate or differently identified workflows can contend for the same webhook.

## Jupiter Alerts API is unavailable

From a default Linux Docker installation, the Compose maps `host.docker.internal` to the host gateway. Confirm the source application is listening on a host interface reachable from containers and is serving:

```text
http://host.docker.internal:8000/api/tokens
```

For the same server on another port, set `APP_API_PORT`. For a different server, set the complete `APP_API_URL` ending in `/api/tokens`. Do not use `localhost` or `127.0.0.1`, because those refer to the controller container rather than the Docker host.

Check the controller log for `[source-api] using ...`. All internal n8n app-state reads use the controller's source proxy, so a red source check indicates one canonical endpoint rather than conflicting controller/workflow settings.

If the controller repeatedly restarts, inspect its log for a rejected port or URL. Invalid protocols, loopback full URLs, embedded credentials, query parameters, fragments, and paths not ending in `/api/tokens` are rejected deliberately.

## Gateway or quote readiness fails

- The Gateway health gate allows roughly five to six minutes on slower first starts and succeeds immediately when Gateway responds. If it reaches `unhealthy`, inspect `gateway` and `gateway-init` logs rather than repeatedly redeploying.
- Confirm `gateway-init` completed successfully and `gateway` is healthy.
- `ENOENT ... ./certs/server_key.pem` means Gateway was started in HTTPS mode by an older Compose revision. Update to the corrected Compose and redeploy the stack. Do not create certificates or publish Gateway port 15888; the current stack explicitly uses HTTP only on its private Docker network.
- Gateway may describe this as development or unsafe HTTP in its own log. That message refers only to transport encryption; it is expected here because the endpoint is confined to the Docker network and is unrelated to the dashboard's Testing/Trading control.
- `bigint: Failed to load bindings, pure JS will be used` is a harmless Gateway fallback warning and is not the cause of an unhealthy container.
- If `gateway-init` reports a non-empty/partial configuration volume, do not rerun defaults over it. Restore the complete `gateway_conf` backup or inspect the volume for missing `root.yml`, `server.yml`, `apiKeys.yml`, and Solana chain files.
- Use the dashboard RPC manager rather than hand-editing YAML.
- Public Solana RPC is allowed for Testing but cannot make Trading Ready green.
- Verify Helius/custom credentials privately; never paste them into an issue or n8n.
- A token-catalogue check may need time to discover decimals and register an exact mint.
- High price impact is a deliberate abort, not a slippage error. Lowering the cap is safer; do not raise it merely to make a trade pass.

## ntfy listener is disconnected or no alert is acted on

- Confirm `NTFY_SERVER` matches Jupiter USDC Price Alerts. For ntfy on the Docker host, use `host.docker.internal`, not `localhost`.
- The value must be a complete unauthenticated HTTP(S) base URL. Embedded credentials, query strings, fragments, port 0, loopback addresses, and authentication-required topics are not supported by this listener.
- Confirm the source token is enabled and publishes a normal `Buy Price Alert` or `Sell Price Alert`.
- Confirm the notification body includes the exact full mint in the `Token: NAME (MINT)` line.
- Confirm the current effective ntfy topic shown by the source matches the trader.
- Shared topics are allowed unless private-topic enforcement is enabled.
- Alerts older than the controller's freshness window are rejected even though ntfy lookback can replay them.
- `MASTER OFF`, disabled AUTO direction, missing target, oversized scenario, and safety lock all intentionally stop the alert path.

Action Readiness/Rules and source armed/inactive display state are not troubleshooting gates for this trader.

## An alert arrived but no trade appears

Open the collapsed **Recent Alert Activity** panel first. Its heading summarizes the newest alert known to the controller; expanding it shows the newest three unique results, with up to ten available through **Show more**. Expand the matching item to see its bounded validated details and **What to check** guidance.

- If there is no matching activity entry and the event should still be among the newest ten unique alerts, check authenticated machine diagnostics for its receipt in the latest 30 audit rows. If no matching `NTFY_RECEIVED` row is present there, check listener status, server/topic agreement, source connectivity, and freshness as described above.
- `PROCESSING` means validation has not reached a terminal decision. Refresh shortly and do not send a duplicate alert. `PROCESSING_ERROR` means a pre-terminal handoff failed, or a receive-only entry has remained unresolved for more than ten minutes; run **Quick Test Everything** and inspect the controller/n8n logs.
- `IGNORED` means the alert did not pass initial authorization, for example because it was not a fresh normal BUY/SELL price alert or a required control was off.
- `WOULD_TRADE` is the expected TESTING result. It deliberately creates no blockchain transaction, signature, or **Recent Trades** record.
- `ABORTED` means a fresh validation or safety check stopped submission. Fix the displayed cause, then wait for a new source alert; changing settings does not replay the old event.
- `BURST_SUPPRESSED` and `TRIGGER_GUARD_SUPPRESSED` are deliberate duplicate/replay protections rather than missing executions.
- `TRADE_CONFIRMED`, `TRADE_FAILED`, or `TRADE_UNCERTAIN` means the alert reached the durable execution path and should also have a **Recent Trades** record. Follow the separate uncertain-trade procedure below for `TRADE_UNCERTAIN`.
- `PROCESSED` or `TRADE_RESULT` is a compatibility fallback for an older or unclassified terminal record. Inspect the corresponding durable trade/audit details rather than assuming success.

A live-trade outcome is accepted only when the controller has the matching durable trade record. If an internal response claims a trade result without that record, the alert is shown as `ABORTED` rather than displaying an unsupported success or failure.

The dashboard shows at most ten recent alert results and ten recent trade records to stay compact on desktop and mobile. This display limit does not delete the controller's bounded durable history: it retains up to 1,000 audit rows and 500 trade records in `controller_data`; authenticated machine diagnostics expose the latest 30 audit rows and 20 trade records.

A pre-terminal network or non-success HTTP handoff can be retried safely by the listener using the same bounded ntfy event ID; the dashboard merges that progress into one activity item. This is not a transaction retry button. Terminal ignored, blocked, testing, and trade results are marked seen and are not reconsidered merely because controls later change. Never manually resend an alert whose submission outcome could be uncertain.

## RPC change appears not to apply

RPC changes require `TESTING`, `MASTER OFF`, and no active trade. The configurator preflights the endpoint, updates persistent Gateway configuration, signals the supervisor with a unique request, and the controller waits for both its acknowledgement and the exact live endpoint fingerprint. A second concurrent change is rejected.

Preflight calls both `getGenesisHash` and `getLatestBlockhash`. An "unexpected genesis hash" error means the endpoint is not Solana mainnet-beta (commonly devnet/testnet) or the provider is not returning the standard RPC response; it is rejected before Gateway configuration changes.

Inspect `rpc-configurator` and `gateway` logs. The supervisor must show it is tracking the real Node server. Do not change it back to a pnpm wrapper.

## `UNCERTAIN` trade or safety lock

Do not restart repeatedly and do not retry the alert. Keep `MASTER` off. Check the recorded signature and exact assigned wallet on chain, then compare token, USDC, and SOL balances. Clear the lock only after a human has resolved whether the transaction landed. Clearing records the affected trade as `REVIEWED`; it does not remove its threshold guard.

Reset replay guards only in `TESTING` with `MASTER OFF`, and only after intentionally re-arming/resetting the corresponding source alerts.

## Restores and changed secrets

An existing installation requires its original `N8N_DB_PASSWORD`, `N8N_ENCRYPTION_KEY`, `N8N_RUNNERS_AUTH_TOKEN`, and `GATEWAY_PASSPHRASE`. Changing them can break database access, runner authentication, n8n encrypted data, or Gateway wallet access. Restore the stable secrets alongside all seven named volumes. Follow [Storage, backup, and restore](storage.md); do not merge a backup into partly initialized volumes.

## Controller reports unreadable or invalid persisted JSON

The controller deliberately refuses to start if an existing `state.json`, `auth.json`, `seen.json`, `trades.json`, `audit.json`, or `trigger-guards.json` cannot be parsed, has the wrong top-level JSON type, or contains invalid persisted field types/values. It does not replace or normalize the file with defaults because that could erase or weaken a safety lock, risk cap, unresolved trade, replay guard, wallet-backup confirmation, or authentication state.

Stop the complete stack and restore a known-good `controller_data` backup together with the matching installation secrets. Preserve the reported volume/file for investigation. Do not repeatedly restart, delete the file, create an empty replacement, or merge a backup over the damaged volume. If the only problem is a genuinely lost dashboard password and `auth.json` is otherwise healthy, use the separate stopped-stack password procedure at the top of this guide.

## RPC configurator reports an invalid RPC-control token

The token in `gateway_control` authenticates the Docker-private controller/configurator channel. A malformed existing token is rejected rather than replaced while services may still be using it. Stop the complete stack and restore the matching `gateway_control` backup. If no backup exists, an experienced operator may preserve the damaged volume for investigation, move only `rpc-config-token` while every stack service is stopped, and then start the whole stack so one new token is generated before the controller starts. Do not alter `gateway_conf`; it contains Gateway configuration and encrypted wallet material.
