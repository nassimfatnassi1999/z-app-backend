# Z Backend VPS Deployment

Production Docker Compose deployment for the Z NestJS backend and a dedicated PostgreSQL container.

## Services

- `z_backend`: NestJS API container, exposed on host port `3002` by default.
- `z_postgres`: PostgreSQL container, internal port `5432`, optional host debug port `55432`.

No Redis, MinIO, Nginx, PM2, or generated-message mail delivery services are deployed.

## Ports

| Service | Container port | Host port |
| --- | ---: | ---: |
| Z backend | `3000` | `3002` |
| Z PostgreSQL | `5432` | `55432` |

Inside Docker, the backend connects to PostgreSQL at `z_postgres:5432`.
The host port `55432` is only for VPS host access or debugging.

## First Deploy

From `z-backend`:

```bash
make prod-deploy
```

Production reads `deploy/.env` directly. Create it once with real production
values (the legacy `deploy/.env.prod` name remains supported):

```bash
cp deploy/.env.prod.example deploy/.env
make prod-deploy
```

Every deployment validates the environment, builds the image, starts only
PostgreSQL, repairs ownership and privileges, runs Prisma migrations once, and
only then starts the backend. If an old PostgreSQL volume still uses a previous
database role, deployment reuses that administrator role to reconcile the
persistent objects without deleting data. Run `make prod-db-diagnose` for the
database report or `make doctor` for the broader diagnostic. See
[`Deployment.md`](Deployment.md) for updates and rollback.

Direct script usage also works:

```bash
cd deploy
./deploy.sh
```

## Operations

```bash
make prod-stop      # stop containers, preserve database data
make prod-monitor   # show status and recent logs
make prod-menu      # open interactive manager
make prod-undeploy  # remove containers, optionally delete volume
make prod-db-diagnose # owners, privileges, roles, and Prisma state
make prod-db-repair   # repair PostgreSQL only; preserve all data
```

Useful direct commands:

```bash
./monitor.sh logs
./monitor.sh stats
./monitor.sh ps
```

## Migrations

Migrations run in the one-shot `migrate` service with `restart: "no"`:

```bash
docker compose run --rm --no-deps migrate npx prisma migrate deploy
```

The backend image starts only `node dist/main.js`; a failed migration stops the
deployment before the backend is created or restarted.

## Firewall

Open the backend port:

```bash
sudo ufw allow 3002/tcp
```

Avoid opening PostgreSQL publicly. If temporary host debugging is needed, restrict it to your IP:

```bash
sudo ufw allow from YOUR_IP to any port 55432 proto tcp
```

Recommended: do not expose PostgreSQL publicly.

## Flutter Production URL

For Flutter production:

```env
API_BASE_URL=http://VPS_IP:3002
```

For a real release, HTTPS is recommended later via Nginx, Caddy, or Cloudflare. This deployment intentionally does not add a reverse proxy.

## Health Check

```bash
curl -f http://localhost:3002/api/v1/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "z-backend"
}
```
