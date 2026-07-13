# Production deployment

## Configuration

The production source of truth is `deploy/.env`. It is ignored by Git.
Create it from the documented template:

```bash
cp deploy/.env.prod.example deploy/.env
```

Configure at least the database, JWT, email-code, Deepgram, Groq and mail
credentials. Never commit or print this file. `GROQ_BASE_URL`, all three Groq
model variables, `AI_REQUEST_TIMEOUT_MS` and `AI_MAX_REPAIR_ATTEMPTS` are
mandatory.

For compatibility, an existing `deploy/.env.prod` is still accepted when
`deploy/.env` is absent. The deploy path never reads `.env.example` and never
blocks because a documentation template is older than the real environment.

## First deployment

```bash
make prod-deploy
make doctor
```

Prisma migrations run inside the backend container before NestJS starts. The
deployment fails if the container exits, restarts, misses its health deadline,
or Prisma reports an error.

The backend container always connects to the bundled PostgreSQL service through
`z_postgres:5432`. A `DATABASE_URL` using `localhost` may still be kept for
host-side tools; Compose replaces only the container runtime URL using the
mandatory `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` values.

For an existing PostgreSQL volume, changing those variables does not make the
official image update stored roles. Before NestJS starts, deployment therefore
reconciles the configured role and password through PostgreSQL's local socket,
updates database ownership when necessary, and verifies a real TCP login. This
preserves all database data and never prints the password.

## Updating

Pull the desired revision, review `.env.example` and
`deploy/.env.prod.example`, then run:

```bash
make prod-deploy
```

Compose explicitly receives `deploy/.env`; images are rebuilt without
cache and containers are force-recreated, so changed environment values cannot
remain trapped in an old container.

## Diagnosis

```bash
make doctor
make prod-monitor
```

`make doctor` checks Docker, Compose, required variable names, backend and
PostgreSQL state, Prisma, provider configuration, the published port and the
HTTP health endpoint. Secret values are never printed.

## Rollback

1. Check out the previously known-good Git revision or image source.
2. Restore the matching `deploy/.env` from the secret manager backup.
3. Run `make prod-deploy`.
4. Run `make doctor` and inspect `make prod-monitor`.

Prisma migrations must be backward-compatible. The automatic rollback does not
reverse database migrations or delete the PostgreSQL volume.
