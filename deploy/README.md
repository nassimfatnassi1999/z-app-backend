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

Every deployment validates the environment before Docker is stopped, rebuilds
without cache, force-recreates the containers, waits for a healthy NestJS
process and verifies Prisma. If an old PostgreSQL volume still uses a previous
database role, deployment aligns the backend runtime automatically without
deleting data. Run `make doctor` for a complete diagnostic. See
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
```

Useful direct commands:

```bash
./monitor.sh logs
./monitor.sh stats
./monitor.sh ps
```

## Migrations

Migrations run automatically when `z_backend` starts:

```bash
npx prisma migrate deploy && node dist/main.js
```

You can also run migrations from the interactive menu.

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
