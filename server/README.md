# PPlay backend

Frameworkless Node.js HTTP backend for the static mini-games in the project root. It uses the built-in `node:sqlite` module and has no npm dependencies. Node 22.5+ (the version used to develop this backend is 22.23) is recommended. On a runtime without `node:sqlite`, startup stops with an explicit error instead of silently using an unsafe in-memory fallback.

## Run

From the project root:

```bash
node server/index.mjs
```

The server listens on `http://localhost:3000` by default, serves the existing frontend from the project root, and stores SQLite data in `server/pplay.sqlite`. Environment variables can be exported directly; `server/.env.example` is only a template and is not loaded automatically:

```bash
export PORT=3000
export DB_FILE=./server/pplay.sqlite
export DISCORD_CLIENT_ID=...
export DISCORD_CLIENT_SECRET=...
export DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback
node server/index.mjs
```

Register the exact callback URL in the Discord Developer Portal. The Discord client secret is used only by the server and is never sent to the browser. The OAuth flow is Authorization Code with the `identify` scope, a random HttpOnly state cookie, a server-to-server code exchange, and a server-side session.

## API smoke examples

```bash
curl -i http://localhost:3000/api/health
curl -i http://localhost:3000/api/me
curl -i http://localhost:3000/api/scores/snake

# Login first in a browser at http://localhost:3000/auth/discord.
# Then use the session cookie returned by the callback:
curl -i -c cookies.txt -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"game":"snake","score":120}' \
  http://localhost:3000/api/scores
curl -i -b cookies.txt http://localhost:3000/api/scores/snake
curl -i -X POST -b cookies.txt http://localhost:3000/auth/logout
```

`POST /api/scores` accepts only a JSON object with a slug-shaped `game` (lowercase ASCII letters, digits and hyphens) and a non-negative safe integer `score`. It requires a valid HttpOnly session cookie and atomically keeps the user's maximum score for each game. The public leaderboard returns at most 20 rows. Expired sessions are removed at startup and when they are encountered.

## Routes

- `GET /api/health` — service and SQLite health.
- `GET /api/me` — `{ "user": null }` or the authenticated Discord profile.
- `POST /api/scores` — authenticated max-score upsert.
- `GET /api/scores/:game` — public top 20 leaderboard.
- `GET /auth/discord` — starts Discord Authorization Code OAuth.
- `GET /auth/discord/callback` — exchanges the code and creates a session.
- `POST /auth/logout` — removes the current session and clears its cookie.

Unknown `/api` and `/auth` paths return JSON errors. JSON request bodies are limited to 32 KiB. Responses use JSON content types, `nosniff`, and no-store caching for API responses.

## Deployment notes

- The normal deployment is one origin: this server serves `index.html`, JS, CSS, assets, and the API. Cookies use `HttpOnly; SameSite=Lax`; `Secure` is enabled for HTTPS requests and automatically when `NODE_ENV=production`.
- For a reverse proxy, forward the original `Host` and `X-Forwarded-Proto` headers, terminate TLS at the proxy, and set `DISCORD_REDIRECT_URI` to the public HTTPS callback URL. The backend itself remains a normal HTTP upstream.
- Same-origin requests need no CORS configuration. If a separate frontend origin is intentional, set `CORS_ORIGIN` to one exact origin (never `*` with credentials), use HTTPS, and configure the proxy to forward cookies.
- The SQLite file contains user IDs, profiles, sessions, and scores. Protect its directory and back it up. Run one backend process per SQLite file unless the deployment has a deliberate SQLite concurrency/locking plan.
- Set `NODE_ENV=production`, use a strong reverse-proxy TLS configuration, keep the Discord secret out of the repository, and use a writable persistent location for `DB_FILE`.
- Frontend уже подключён к этим endpoints: вход ведёт на `/auth/discord`, профиль читается из `/api/me`, авторизованные результаты отправляются в `/api/scores`, а выход вызывает `/auth/logout`. В guest-режиме остаётся локальный fallback. Client secret не попадает в frontend.
