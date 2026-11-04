# Roku Manager

Roku Manager is a self-hosted web app for monitoring Roku devices and enforcing daily usage limits.

It discovers Roku devices on your local network, shows the currently active app, and can power off or return a device home when a usage rule is reached.

## Requirements

- A Roku device on the same local network as Roku Manager
- **Settings → System → Advanced system settings → Control by mobile apps → Network access** enabled on the Roku
- Docker on a Linux host, or Node.js 24+ when running directly on the host

Roku discovery uses SSDP multicast. The Roku Manager host must be able to reach the Roku devices on the LAN.

## Run with Docker Compose

1. Download the project and create an environment file:

   ```sh
   cp .env.example .env
   ```

2. Set a strong `AUTH_PASSWORD` in `.env`.

3. Start Roku Manager:

   ```sh
   docker compose up -d
   ```

4. Open [http://localhost:3000](http://localhost:3000) and sign in with `AUTH_USER` and `AUTH_PASSWORD`.

The Compose configuration:

- Uses the published image from GitHub Container Registry
- Uses host networking so SSDP discovery can reach the LAN
- Persists settings, sessions, and event history in the `roku-manager-data` volume
- Restarts the service automatically
- Exposes a health check at `/health`

View logs with:

```sh
docker compose logs -f
```

Stop the service with:

```sh
docker compose down
```

The data volume is preserved when the service is stopped. Add `-v` to `docker compose down` only if you also want to delete the saved settings and history.

### Docker networking

Host networking is the most reliable option for Roku discovery and works best on Linux. Docker Desktop on macOS and Windows runs containers inside a VM, where multicast discovery may not reach the LAN. If no devices are found, run Roku Manager directly on the host or use a Linux host or VM on the same network.

## Run directly with Node.js

Running directly on the host can be useful on macOS, Windows, or a Linux system where Docker multicast networking is unavailable.

```sh
pnpm install
pnpm build
cp .env.example .env
```

Set a strong `AUTH_PASSWORD` in `.env`, then start the service:

```sh
pnpm start
```

Open [http://localhost:3000](http://localhost:3000).

When running from the source tree, the default storage paths are inside the service data directory:

- `DATA_FILE`: saved devices, settings, and sessions
- `EVENT_LOG_DIR`: per-device usage and enforcement history

For a different location, set both paths in `.env`, for example:

```dotenv
DATA_FILE=/var/lib/roku-manager/state.json
EVENT_LOG_DIR=/var/lib/roku-manager/events
```

## Configuration

The most useful settings are:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DISABLE_AUTH` | `false` | Set to `true` to disable Basic Auth; only use on a trusted network |
| `AUTH_USER` | `admin` | Basic Auth username |
| `AUTH_PASSWORD` | `change-me` | Basic Auth password; change this before exposing the service |
| `DATA_FILE` | Service `data/state.json` | Persistent application state |
| `EVENT_LOG_DIR` | Service `data/events` | Persistent event history |
| `DISCOVERY_INTERVAL_MS` | `21600000` | Device rediscovery interval; 6 hours |
| `ENFORCEMENT_INTERVAL_MS` | `15000` | Usage enforcement interval; 15 seconds |
| `ENFORCEMENT_RECHECK_DELAY_MS` | `1000` | Delay before retrying an enforcement action |
| `ENFORCEMENT_RECHECK_ATTEMPTS` | `3` | Maximum enforcement retries |
| `TZ` | System time zone | Time zone used by the container/runtime |

See `.env.example` for the complete list of available variables.

## Updating

Pull the latest image and recreate the container:

```sh
docker compose pull
docker compose up -d
```

Your data remains in the `roku-manager-data` volume.

## Troubleshooting

### No Roku devices appear

- Confirm the Roku and Roku Manager are on the same LAN.
- Enable **Network access** under the Roku mobile-app settings.
- On Linux, confirm the host firewall allows SSDP multicast traffic.
- If using Docker Desktop, try running directly on the host or on a Linux machine.
- Add a device manually by IP from the Devices screen if discovery is unavailable.

### A device is offline

Roku Manager keeps known devices and their settings even when a Roku is temporarily unreachable. Check the Roku’s IP address and network connection, then refresh the device list.

### Health check

The unauthenticated health endpoint can be used by monitoring systems:

```sh
curl http://localhost:3000/health
```

It returns `{ "ok": true }` when the service is running.
