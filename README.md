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

## Direct Roku SSDP discovery

The standalone CLI sends a raw SSDP `M-SEARCH` request directly to the LAN multicast address. It does not use the Roku Manager server or its API:

```sh
npm run ssdp
npm run ssdp -- --json --timeout 10000
npm run ssdp -- --st ssdp:all --interface en0
```

The default search target is Roku's `roku:ecp`. Use `npm run ssdp -- --help` for all request and network options.

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
docker compose up -d
```

The Compose service pulls `ghcr.io/klcodanr/roku-manager:latest`, uses host networking so SSDP discovery can reach Roku devices on the LAN, stores application data in the `roku-manager-data` volume, restarts automatically, and includes a health check. Open `http://localhost:3000`. Stop it with `docker compose down`; add `-v` only when you also want to remove the persisted data.

Host networking is supported reliably on Linux. Docker Desktop runs containers inside a VM, and its multicast behavior varies by version and configuration; if discovery still returns no devices on macOS or Windows, run the manager directly on the host or use a Linux host/VM on the same LAN. The default bridge network is not sufficient for Roku SSDP discovery.

Releases are created automatically from commits pushed to `main` using semantic-release. Use Conventional Commit prefixes such as `fix:` for patch releases, `feat:` for minor releases, and `BREAKING CHANGE:` for major releases. Each release publishes a versioned image and updates the `latest` image in GHCR.

## API

All API routes use HTTP Basic Authentication.

- `GET /health` returns an unauthenticated liveness response.
- `GET /api/devices` returns device diagnostics and active app information. Add `?refresh=true` to trigger an SSDP scan first.
- `POST /api/devices` accepts `{ "ip": "192.168.1.17" }` to add a Roku directly without SSDP.
- `GET /api/devices` returns device diagnostics and active app information. Add `?refresh=true` to trigger an SSDP scan first.
- `GET /api/devices/:id/settings` returns saved policy settings.
- `GET /api/devices/:id/events` returns the latest 10 event-log records for a device plus cached, server-computed metrics and a compact usage series covering the full retained history, including rotated files.
- `PUT /api/devices/:id/settings` accepts `{ "rules": [{ "name": "School nights", "days": [1, 2, 3, 4, 5], "start": "15:00", "end": "21:00", "maxMinutes": 120, "limitBehavior": "rest_of_day", "cooldownMinutes": 15 }] }`. Rules are evaluated in array order and the first matching rule is applied.
- `DELETE /api/devices/:id/settings` resets the device policy and clears persisted daily usage and lockout state.
- `POST /api/enforce` immediately checks all discovered devices and powers off active devices that are in a blocked window or have reached their daily limit.

Known Roku devices and their current IP addresses are persisted. Enforcement queries those IPs directly. A failed direct query triggers an SSDP recovery scan, while the background scan runs every `DISCOVERY_INTERVAL_MS` milliseconds (default 6 hours). Users can also add a device by IP with `POST /api/devices`. The scheduler runs enforcement every `CHECK_INTERVAL_MS` milliseconds, defaulting to 15 seconds. After a device is enforced, it is rechecked up to three times at one-second intervals by default; configure `ENFORCEMENT_RECHECK_DELAY_MS` and `ENFORCEMENT_RECHECK_ATTEMPTS` to change this behavior. On-time is accumulated across active periods and persisted by local calendar day. Reaching a limit locks the device either until the next local midnight (`rest_of_day`) or for `cooldownMinutes` (`cooldown`). The lockout remains persisted and is checked on every enforcement pass; failed power-off requests are retried. Usage resets at local midnight.

Each enforcement check also appends one JSON Lines event per device to its own file under `EVENT_LOG_DIR`, which defaults to `data/events` and is separate from `DATA_FILE`. Settings, sessions, and event records are associated with the stable Roku `deviceId`, while the network `clientId` is used only to locate and control the current IP address. To migrate existing IP-keyed state and events, set `MIGRATE_DATA=DEVICE_IDS` for startup. Device filenames use a URL-safe encoding of the storage device ID. Events include the timestamp, device ID, active state, current app name, enforcement status, enforcement event, usage, and lock expiry. Each device log rotates when it reaches `EVENT_LOG_MAX_BYTES` (10 MiB by default) and retains `EVENT_LOG_MAX_FILES` rotated files (3 by default), plus the active file. Storage is therefore bounded per device to approximately 40 MiB by default, plus a possible final event larger than the configured limit.
