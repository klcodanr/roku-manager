# Roku Manager

A vanilla Node.js application with a Hono API and browser UI for discovering Roku devices, viewing diagnostics, and enforcing daily usage limits and blocked time windows.

## Run locally

Requires Node.js 22 or newer. Roku devices must have **Control by mobile apps > Network access** enabled.

```sh
npm install
cp .env.example .env
npm start
```

Open `http://localhost:3000` and authenticate with the values in `.env`. Settings are stored in `data/state.json` by default. If no `.env` or `AUTH_PASSWORD` is provided, local development uses `admin` / `change-me`; set a real password before exposing the service.

## Docker

The image is based on `node:22-alpine` and runs as the non-root `node` user. Roku SSDP discovery needs access to the local network; host networking is the most reliable option on Linux:

```sh
docker build -t roku-manager .
docker run --rm --network host \
  -e AUTH_USER=admin \
  -e AUTH_PASSWORD='use-a-long-password' \
  -v roku-manager-data:/app/data \
  roku-manager
```

On Docker Desktop, publish port `3000` and ensure the container can reach the LAN multicast/broadcast network. See `.env.example` for all settings.

### Docker Compose

```sh
cp .env.example .env
# Set AUTH_PASSWORD in .env before exposing the service.
docker compose up -d --build
```

The Compose service uses host networking so SSDP discovery can reach Roku devices on the LAN, stores application data in the `roku-manager-data` volume, restarts automatically, and includes a health check. Open `http://localhost:3000`. Stop it with `docker compose down`; add `-v` only when you also want to remove the persisted data.

Host networking is supported reliably on Linux. Docker Desktop runs containers inside a VM, and its multicast behavior varies by version and configuration; if discovery still returns no devices on macOS or Windows, run the manager directly on the host or use a Linux host/VM on the same LAN. The default bridge network is not sufficient for Roku SSDP discovery.

## API

All API routes use HTTP Basic Authentication.

- `GET /health` returns an unauthenticated liveness response.
- `GET /api/devices` discovers and returns device diagnostics and active app information. The response `id` is a network client ID derived from the current IP; `deviceId` is the stable Roku identity from `info.deviceId`. Add `?refresh=true` to bypass the 30-second discovery cache.
- `GET /api/devices/:id/settings` returns saved policy settings.
- `GET /api/devices/:id/events` returns the latest 10 event-log records for a device plus cached, server-computed metrics and a compact usage series covering the full retained history, including rotated files.
- `PUT /api/devices/:id/settings` accepts `{ "maxMinutes": 120, "limitBehavior": "rest_of_day", "cooldownMinutes": 15, "blockedWindows": [{ "start": "22:00", "end": "07:00" }] }`.
- `DELETE /api/devices/:id/settings` resets the device policy and clears persisted daily usage and lockout state.
- `POST /api/enforce` immediately checks all discovered devices and powers off active devices that are in a blocked window or have reached their daily limit.

The scheduler runs enforcement every `CHECK_INTERVAL_MS` milliseconds, defaulting to 15 seconds. On-time is accumulated across active periods and persisted by local calendar day. Reaching a limit locks the device either until the next local midnight (`rest_of_day`) or for `cooldownMinutes` (`cooldown`). The lockout remains persisted and is checked on every enforcement pass; failed power-off requests are retried. Usage resets at local midnight.

Each enforcement check also appends one JSON Lines event per device to its own file under `EVENT_LOG_DIR`, which defaults to `data/events` and is separate from `DATA_FILE`. Settings, sessions, and event records are associated with the stable Roku `deviceId`, while the network `clientId` is used only to locate and control the current IP address. To migrate existing IP-keyed state and events, set `MIGRATE_DATA=DEVICE_IDS` for startup. Device filenames use a URL-safe encoding of the storage device ID. Events include the timestamp, device ID, active state, current app name, enforcement status, enforcement event, usage, and lock expiry. Each device log rotates when it reaches `EVENT_LOG_MAX_BYTES` (10 MiB by default) and retains `EVENT_LOG_MAX_FILES` rotated files (3 by default), plus the active file. Storage is therefore bounded per device to approximately 40 MiB by default, plus a possible final event larger than the configured limit.
