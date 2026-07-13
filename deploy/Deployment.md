# Production deployment

## Configuration

The production source of truth is `deploy/.env.prod`. It is ignored by Git.
Create it from the documented template:

```bash
cp deploy/.env.prod.example deploy/.env.prod
```

Configure at least the database, JWT, email-code, Deepgram, Groq and mail
credentials. Never commit or print this file. `GROQ_BASE_URL`, all three Groq
model variables, `AI_REQUEST_TIMEOUT_MS` and `AI_MAX_REPAIR_ATTEMPTS` are
mandatory.

When a validated root `.env` already exists, the first `make prod-deploy`
creates `deploy/.env.prod` automatically. A `localhost` PostgreSQL hostname is
translated to the internal `z_postgres` Compose hostname.

For compatibility with installations that previously configured only the root
`.env`, `make prod-deploy` copies newly-required keys from it into
`deploy/.env.prod`. Existing production values are never overwritten.

## First deployment

```bash
make prod-deploy
make doctor
```

Prisma migrations run inside the backend container before NestJS starts. The
deployment fails if the container exits, restarts, misses its health deadline,
or Prisma reports an error.

## Updating

Pull the desired revision, review `.env.example` and
`deploy/.env.prod.example`, then run:

```bash
make prod-deploy
```

Compose explicitly receives `deploy/.env.prod`; images are rebuilt without
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
2. Restore the matching `deploy/.env.prod` from the secret manager backup.
3. Run `make prod-deploy`.
4. Run `make doctor` and inspect `make prod-monitor`.

Prisma migrations must be backward-compatible. The automatic rollback does not
reverse database migrations or delete the PostgreSQL volume.
