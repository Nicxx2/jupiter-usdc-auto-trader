# Deploying with Portainer

This is the simplest Portainer path: paste the Compose, enter environment variables, deploy, and use only port 5680.

Use a **Docker Standalone** Portainer environment. Do not deploy this Compose with Docker Swarm: its one-shot initializers and health-gated `depends_on` ordering are designed for Docker Compose on one server. Docker also documents that `docker stack deploy` uses a legacy Compose format rather than the current Compose specification.

[Jupiter USDC Price Alerts](https://github.com/Nicxx2/jupiter-usdc-price-alerts) is the required passive monitoring and signal source; this auto trader is its optional execution companion and does not monitor prices by itself. Install the source first and use a multi-token release exposing `GET /api/tokens`; this release was contract-checked against Jupiter Alerts v3.4.

The trader's Linux host needs an available TCP port 5680, enough Docker storage, and outbound DNS/HTTPS access. All pinned images provide Linux AMD64 and ARM64 variants.

The Compose uses project-scoped service names, networks, and named volumes. Its default dashboard still publishes host port 5680, so the copy/paste configuration supports one stack per host unless an advanced operator deliberately changes the published port. Different stack names have isolated volume namespaces.

Portainer supports pasting a Compose file into its Web editor and defining environment variables separately, so updating a value does not require editing the Compose. See Portainer's official [Add a new stack](https://docs.portainer.io/sts/user/docker/stacks/add) documentation.

> **Legacy upgrade warning:** if the existing deployment stores data under `/Configs`, do not update/start this named-volume Compose until completing the [one-time legacy migration](storage.md#one-time-migration-from-the-legacy-configs-layout). The new volumes start empty and are not automatically populated from old host directories.

## 1. Generate the four stable secrets

Run this four times on a trusted machine and keep each result private:

```sh
openssl rand -hex 32
```

You need one independently generated value for each variable:

```text
N8N_DB_PASSWORD
N8N_ENCRYPTION_KEY
N8N_RUNNERS_AUTH_TOKEN
GATEWAY_PASSPHRASE
```

These are installation identity/recovery material, not disposable deployment values. Back them up securely and reuse the same values when updating or restoring this installation.

## 2. Create the stack

1. Sign in to Portainer with an administrator account.
2. Select the Docker Standalone environment that will run the trader.
3. Open **Stacks**.
4. Select **Add stack**.
5. Enter `jupiter-usdc-auto-trader` as the stack name.
6. Select **Web editor**.
7. Copy the complete `docker-compose.yml` from this repository and paste it into the editor without simplifying it.

Do not add separate n8n or Gateway stacks. They are included and managed internally.

The stack name becomes the persistent volume prefix. Keep it unchanged during every future update. A differently named stack selects a different, empty set of volumes and appears to be a fresh installation.

## 3. Enter environment variables

Expand **Environment variables** below the Web editor and add these four required values:

| Name | Value |
| --- | --- |
| `N8N_DB_PASSWORD` | First generated secret |
| `N8N_ENCRYPTION_KEY` | Second generated secret |
| `N8N_RUNNERS_AUTH_TOKEN` | Third generated secret |
| `GATEWAY_PASSPHRASE` | Fourth generated secret |

The deployment will stop with a clear interpolation error if any required value is missing or empty.

Portainer also supports **Load variables from .env file**. You can upload a privately prepared `.env` based on `.env.example` instead of adding variables individually. Do not upload `.env` to GitHub or another public location.

## 4. Point to the required Jupiter USDC Price Alerts source

### Same server, default port 8000

Add nothing. The default endpoint is:

```text
http://host.docker.internal:8000/api/tokens
```

The Compose maps `host.docker.internal` to the Docker host gateway on Linux.

### Same server, another port

Add one Portainer environment variable:

```text
APP_API_PORT=8001
```

The controller builds:

```text
http://host.docker.internal:8001/api/tokens
```

The Jupiter Alerts API must be published/listening on that host port and reachable from Docker. A process bound only to `127.0.0.1` may not be reachable through the host gateway.

### Different server or domain

Add the complete endpoint:

```text
APP_API_URL=https://alerts.example.com/api/tokens
```

A non-empty `APP_API_URL` overrides `APP_API_PORT`. The URL must:

- use `http://` or `https://`;
- end in `/api/tokens`;
- use a valid port from 1 through 65535 when a port is specified;
- not use `localhost`, the `127.0.0.0/8` loopback range, `0.0.0.0`, `::`, or `::1`;
- not contain embedded username/password credentials;
- not contain a fragment, query string, or API key; and
- be reachable from the Docker host's containers.

Prefer a private network such as Tailscale. Otherwise use HTTPS and firewall the source so only the trader server can reach it. This integration does not add authentication to the Jupiter Alerts `/api/tokens` endpoint, so do not expose that endpoint publicly just to connect the two apps. If the other server uses a LAN IP, ensure its firewall permits the Docker server.

Optional variables are:

```text
NTFY_SERVER=https://ntfy.sh
TZ=Europe/London
```

`NTFY_SERVER` must match the server used by Jupiter USDC Price Alerts and be reachable from the trader container. For self-hosted ntfy on this Docker host, use `http://host.docker.internal:PORT`, not `localhost`.

If port 5680 is accessed **exclusively** through an HTTPS reverse proxy, also add:

```text
DASHBOARD_COOKIE_SECURE=true
```

Leave it unset/false for direct `http://SERVER-IP:5680` access. With `true`, a browser correctly refuses to send the login cookie over plain HTTP.

## 5. Deploy and wait

Select **Deploy the stack**. Image downloads and first-time initialization can take several minutes.

Portainer creates all seven Docker-managed volumes automatically. You do not create or enter any host directories. After deployment, **Volumes** should show project-prefixed entries for `postgres_data`, `n8n_data`, `bootstrap_data`, `controller_data`, `gateway_control`, `gateway_conf`, and `gateway_logs`. Portainer documents the Docker-managed model in its [Volumes](https://docs.portainer.io/user/docker/volumes) guide.

In the stack's container list:

- `n8n-permissions`, `gateway-init`, and `n8n-bootstrap` are one-shot services; an exited state with exit code 0 is expected after successful completion.
- `postgres`, `n8n`, `n8n-runner`, `gateway`, `rpc-configurator`, and `trading-controller` should remain running.
- Health-gated services may show waiting/starting while initialization completes.

If the stack fails immediately, first check Portainer's deployment error for a missing required environment variable.

## 6. Sign in

1. Open the `trading-controller` container in Portainer.
2. Open **Logs**.
3. Find the `FIRST-RUN ADMIN PASSWORD` block.
4. Open `http://SERVER-IP:5680`.
5. Sign in and change the generated password immediately.

Do not publish or expose n8n 5678, Gateway 15888, or configurator 8081. They are intentionally private.

## 7. Confirm the configured source

The controller log includes a safe source line such as:

```text
[source-api] using http://host.docker.internal:8001/api/tokens
```

Run **Quick Test Everything** in the dashboard. The Jupiter Alerts API and internal workflow checks must pass. All n8n source-state reads go through the controller's private proxy, ensuring that initial and final validation use the same configured endpoint.

Remain in `TESTING` with `MASTER` off while completing setup and wallet backup.

## Updating the stack

Open the stack, select **Editor**, replace the Compose only with a reviewed newer release, and select **Update the stack**. Portainer lets you view/edit the stack's environment variables separately.

Before updating:

- keep the existing stack name and update this same stack rather than creating a replacement under another name;
- securely back up all seven named volumes using an application-consistent method, or stop the stack before a complete file-level volume backup; do not archive the raw PostgreSQL volume while it is live;
- record the original four persistent secrets through your secure secret-management process;
- leave those four values unchanged;
- return the trader to `TESTING` with `MASTER` off; and
- do not manually delete the one-shot service state or n8n workflow.

After updating, wait for bootstrap completion and rerun **Quick Test Everything**. Every controller restart automatically returns to `TESTING` and `MASTER OFF`.

Normal stack/container updates reuse the volumes. Never delete the volumes in Portainer, and never use `docker compose down -v` / `down --volumes`; those actions permanently remove durable state. See [Storage, backup, restore, and migration](storage.md), including the required one-time procedure for an older `/Configs` installation.

Restrict access to Portainer itself. Anyone who can administer this stack may be able to view/change its environment variables, replace the Compose, access container logs/consoles, or read/alter persistent volumes.
