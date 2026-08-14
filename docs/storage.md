# Storage, backup, and restore

## What happens automatically

The Compose declares seven **named volumes**. Docker creates them on first deployment, stores them in Docker's managed storage area for the host, and remounts them whenever containers are recreated. Users do not choose Linux, Windows, NAS, or Portainer host paths.

| Logical name | Durable contents |
| --- | --- |
| `postgres_data` | n8n PostgreSQL database |
| `n8n_data` | n8n configuration and application state |
| `bootstrap_data` | controlled workflow bootstrap/restart state |
| `controller_data` | login, controls, audit history, trades, replay/threshold guards, and safety state |
| `gateway_control` | internal RPC-control authentication/restart state |
| `gateway_conf` | Gateway configuration and encrypted wallet material |
| `gateway_logs` | Gateway logs |

Every mount explicitly uses `volume.nocopy: true`. A new volume therefore begins genuinely empty and is initialized only by this stack; image files are not silently copied into it. Containers have no fixed host-global names, and Compose scopes physical volume names to the project.

For the recommended Portainer stack name, physical names normally look like:

```text
jupiter-usdc-auto-trader_postgres_data
jupiter-usdc-auto-trader_controller_data
...
```

The Compose supplies `jupiter-usdc-auto-trader` as a stable default project name, so renaming a CLI checkout directory does not change its volume prefix. An explicit Portainer stack name, `docker compose --project-name`, `-p`, or `COMPOSE_PROJECT_NAME` overrides that default. Use the same explicit value for every operation on an existing installation.

Docker documents named volumes as its preferred persistence mechanism for container data because Docker manages them independently of a container's lifecycle and they are easier to back up or migrate than writable container layers. See Docker's [Volumes](https://docs.docker.com/engine/storage/volumes/) documentation.

## Rules that preserve an installation

- Keep the Portainer **stack name** or Compose **project name** unchanged. Renaming the project creates/selects a different volume namespace and the application will look new even though the original volumes still exist.
- Update the existing Portainer stack in place. Do not create a differently named replacement stack as an update method.
- Keep the four required secret values unchanged and back them up separately from the volumes.
- Never delete these volumes in Portainer or Docker unless permanent destruction is intended.
- A normal `docker compose stop`, restart, update, container recreation, or `docker compose down` preserves named volumes.
- `docker compose down --volumes`, `docker compose down -v`, `docker volume rm`, `docker volume prune --all`, volume-enabled system pruning, and explicit volume deletion in Portainer can destroy persistent data.
- Persistent storage is not a backup. A host/disk failure can remove containers and volumes together.
- Named volumes are not automatically encrypted. Use appropriate host/disk encryption, access control, monitoring, and free-space alerts for the Docker data store.

Docker's [`compose down`](https://docs.docker.com/reference/cli/docker/compose/down/) reference confirms that named volumes are removed only when the volume option is requested. Portainer also warns that [removing a volume](https://docs.portainer.io/2.33-lts/user/docker/volumes/remove) permanently erases its contents.

Portainer's rename/migration feature [does not relocate persistent-volume contents](https://docs.portainer.io/user/docker/stacks/migrate). Back up and restore the volumes explicitly when moving to another Docker environment; changing only the stack definition is not a data migration.

## Backup

Back up all seven volumes **and** the four stable secrets. Gateway recovery/private keys should also have their own separately verified offline recovery copy.

For a complete file-level backup, first return the trader to `TESTING`, turn `MASTER` off, and stop the entire stack. This makes the PostgreSQL files and cross-volume state consistent. Do not make a raw archive of the PostgreSQL volume while PostgreSQL is running.

Portainer users can stop the stack, then use a host, hypervisor, NAS, or Docker-volume backup tool that captures every volume listed above. Portainer's Volumes view is useful for confirming the physical names, but the existence of a volume is not itself a backup.

The following Linux-host example discovers volumes from their Compose labels instead of assuming a storage directory. Run it only after the stack is stopped:

```sh
set -eu
PROJECT_NAME=jupiter-usdc-auto-trader
# Change PROJECT_NAME if the actual existing stack/project name is different.
BACKUP_DIR="$(pwd)/jupiter-auto-trader-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -m 700 "$BACKUP_DIR"

for VOLUME_KEY in postgres_data n8n_data bootstrap_data controller_data gateway_control gateway_conf gateway_logs; do
  VOLUME_NAME="$(docker volume ls \
    --filter "label=com.docker.compose.project=$PROJECT_NAME" \
    --filter "label=com.docker.compose.volume=$VOLUME_KEY" \
    --format '{{.Name}}')"
  test -n "$VOLUME_NAME" || { echo "Missing volume: $VOLUME_KEY" >&2; exit 1; }
  test "$(printf '%s\n' "$VOLUME_NAME" | wc -l)" -eq 1 || { echo "Ambiguous volume: $VOLUME_KEY" >&2; exit 1; }

  docker run --rm \
    --mount "type=volume,src=$VOLUME_NAME,dst=/source,readonly" \
    --mount "type=bind,src=$BACKUP_DIR,dst=/backup" \
    alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce \
    sh -c "tar -C /source -czf /backup/$VOLUME_KEY.tgz ."
done

docker run --rm \
  --mount "type=bind,src=$BACKUP_DIR,dst=/backup" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce \
  sh -c 'cd /backup && sha256sum *.tgz > SHA256SUMS'
```

Store the resulting archives and a secure copy of these values away from the Docker host:

```text
N8N_DB_PASSWORD
N8N_ENCRYPTION_KEY
N8N_RUNNERS_AUTH_TOKEN
GATEWAY_PASSPHRASE
```

Treat `controller_data`, `gateway_conf`, the secret backup, and all wallet recovery material as sensitive. Encrypt backups at rest and test restoration on an isolated system.

Monitor Docker disk usage, including `gateway_logs` and the container logging driver. A full Docker data filesystem can stop PostgreSQL or prevent safety/audit state from being written. Resolve capacity problems while the trader remains stopped and `MASTER` is off; do not delete state volumes to reclaim space.

## Restore to a clean host

1. Install Docker Compose v2 and obtain the same reviewed repository release.
2. Restore the four original secret values into a private `.env` or Portainer environment-variable set.
3. Use the same project/stack name as the backup.
4. Create the stack's containers and empty volumes without starting services. With the CLI, run `docker compose create`.
5. Confirm every destination volume is empty, then extract its matching archive into it. Do not merge an old backup over a partially initialized or newer installation.
6. Start the stack, keep it in `TESTING` with `MASTER` off, run **Quick Test Everything**, confirm wallets/configuration/history, and review the safety state before considering Trading.

This Linux-host restore pattern refuses to write into a non-empty destination:

```sh
set -eu
PROJECT_NAME=jupiter-usdc-auto-trader
# Change PROJECT_NAME to the project name recorded with the backup.
BACKUP_DIR=/absolute/path/to/jupiter-auto-trader-backup

docker run --rm \
  --mount "type=bind,src=$BACKUP_DIR,dst=/backup,readonly" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce \
  sh -c 'cd /backup && sha256sum -c SHA256SUMS'

for VOLUME_KEY in postgres_data n8n_data bootstrap_data controller_data gateway_control gateway_conf gateway_logs; do
  VOLUME_NAME="$(docker volume ls \
    --filter "label=com.docker.compose.project=$PROJECT_NAME" \
    --filter "label=com.docker.compose.volume=$VOLUME_KEY" \
    --format '{{.Name}}')"
  test -n "$VOLUME_NAME" || { echo "Missing volume: $VOLUME_KEY" >&2; exit 1; }
  test "$(printf '%s\n' "$VOLUME_NAME" | wc -l)" -eq 1 || { echo "Ambiguous volume: $VOLUME_KEY" >&2; exit 1; }
  test -f "$BACKUP_DIR/$VOLUME_KEY.tgz" || { echo "Missing archive: $VOLUME_KEY.tgz" >&2; exit 1; }

  docker run --rm \
    --mount "type=volume,src=$VOLUME_NAME,dst=/target" \
    --mount "type=bind,src=$BACKUP_DIR,dst=/backup,readonly" \
    alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce \
    sh -c "test -z \"\$(ls -A /target)\" || { echo 'Destination is not empty' >&2; exit 1; }; tar -C /target -xzf /backup/$VOLUME_KEY.tgz"
done
```

Do not use the restore loop against the only copy of a running production installation. A restore is a deliberate disaster-recovery operation into empty volumes.
