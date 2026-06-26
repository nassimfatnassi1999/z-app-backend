# Z Backend

NestJS backend API for Z, a voice-to-email workflow service. The API supports account registration with email verification, JWT authentication, speech transcription through Deepgram, email draft generation through Groq with a local fallback generator, and draft persistence in PostgreSQL through Prisma.

## Main Features

- User registration, login, refresh tokens, logout, and current-user profile endpoints.
- Email verification with 6-digit codes, hashed code storage, expiry, resend cooldown, and maximum attempt limits.
- Brevo Transactional Email integration for verification email delivery.
- Speech-to-text endpoint for audio uploads using Deepgram.
- AI email generation pipeline with language detection, intent extraction, recipient/date extraction, tone handling, prompt building, provider validation, retry logic, and local fallback generation.
- Authenticated and anonymous email draft storage.
- Anonymous draft ownership through the `X-Device-Id` header, with a claim flow after login.
- PostgreSQL persistence with Prisma schema and migrations.
- Swagger/OpenAPI documentation at runtime.
- Docker and Docker Compose setup for local PostgreSQL and production deployment.

## Tech Stack

- Runtime: Node.js 20
- Framework: NestJS 10
- Language: TypeScript 5
- Database: PostgreSQL
- ORM: Prisma 5
- Authentication: JWT, Passport JWT, bcrypt
- Validation: class-validator, class-transformer, Nest validation pipe
- API docs: `@nestjs/swagger`
- AI provider: Groq Chat Completions API
- Speech provider: Deepgram Listen API
- Mail provider: Brevo Transactional Email
- Testing: Jest, ts-jest
- Containers: Docker, Docker Compose

## Project Architecture

The application is a single NestJS backend. `src/app.module.ts` wires global configuration, Prisma, authentication, AI, drafts, speech, users, and health modules.

At startup, `src/main.ts`:

- enables CORS with credentials,
- applies the global API prefix `api/v1`,
- enables request body validation with whitelisting and transformation,
- installs a global HTTP exception filter,
- wraps most successful responses in a standard response envelope,
- exposes Swagger UI at `/api/docs`,
- listens on `0.0.0.0` using `PORT` or `3000`.

Most API responses are wrapped as:

```json
{
  "success": true,
  "data": {},
  "timestamp": "2026-06-26T00:00:00.000Z"
}
```

Errors use:

```json
{
  "success": false,
  "data": null,
  "message": "Error message",
  "error": "Error type",
  "timestamp": "2026-06-26T00:00:00.000Z",
  "path": "/api/v1/example"
}
```

The response interceptor returns raw responses for health and speech transcription endpoints.

## Folder Structure

```text
.
├── deploy/
│   ├── .env.prod.example          # Production environment template
│   ├── docker-compose.prod.yml    # Production Docker Compose stack
│   ├── deploy.sh                  # Production deploy/update script
│   ├── manage.sh                  # Interactive production manager
│   ├── monitor.sh                 # Production status/logs/stats helper
│   ├── stop.sh                    # Stop production containers
│   ├── undeploy.sh                # Remove production containers/volume
│   └── README.md                  # Deployment-specific notes
├── prisma/
│   ├── migrations/                # Prisma migration history
│   └── schema.prisma              # PostgreSQL data model
├── src/
│   ├── common/
│   │   ├── decorators/            # Current-user decorator
│   │   ├── filters/               # Global HTTP exception filter
│   │   ├── interceptors/          # Global response interceptor
│   │   └── interfaces/            # Shared response/JWT interfaces
│   ├── modules/
│   │   ├── ai/                    # Email generation pipeline and tests
│   │   ├── auth/                  # Auth, JWT guards/strategy, auth DTOs
│   │   ├── drafts/                # Email draft CRUD/status/claim logic
│   │   ├── mail/                  # Mail abstraction and Brevo provider
│   │   ├── speech/                # Deepgram transcription service
│   │   └── users/                 # Current-user profile endpoints
│   ├── prisma/                    # Prisma Nest module/service
│   ├── app.module.ts              # Root Nest module
│   ├── health.controller.ts       # Health endpoint
│   └── main.ts                    # Application bootstrap
├── docker-compose.yml             # Local PostgreSQL service
├── Dockerfile                     # Production image build
├── Makefile                       # Local and production helper commands
├── nest-cli.json                  # Nest CLI config
├── package.json                   # Scripts and dependencies
├── package-lock.json              # Locked npm dependency tree
├── register-paths.js              # Runtime path alias registration helper
├── tsconfig.json                  # TypeScript config
└── tsconfig.build.json            # TypeScript build config
```

## Prerequisites

- Node.js 20 or newer.
- npm.
- Docker and Docker Compose plugin.
- PostgreSQL, if you do not use the provided Docker Compose database.
- Groq API key for provider-backed email generation. Without it, the service uses its local fallback generator.
- Deepgram API key for speech transcription.
- Brevo API key and verified sender email if email delivery is enabled.

## Installation After Cloning

### macOS / Linux

```bash
git clone <repository-url>
cd z-app-backend
npm install
cp deploy/.env.prod.example .env
```

Then edit `.env` for local development. At minimum, use a local database URL:

```env
NODE_ENV=development
PORT=3000

POSTGRES_DB=zdb
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/zdb

JWT_ACCESS_SECRET=change_me_access_secret_min_32_chars
JWT_REFRESH_SECRET=change_me_refresh_secret_min_32_chars

GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile

DEEPGRAM_API_KEY=
DEEPGRAM_MODEL=nova-3

MAIL_PROVIDER=brevo
MAIL_ENABLED=false
BREVO_API_KEY=
BREVO_FROM_NAME=Z
BREVO_FROM_EMAIL=
BREVO_REPLY_TO=

EMAIL_VERIFICATION_CODE_TTL_MINUTES=5
EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS=60
EMAIL_VERIFICATION_MAX_ATTEMPTS=5
EMAIL_CODE_SECRET=change_me_long_random_secret
```

Start PostgreSQL, run migrations, generate Prisma Client, and start the development server:

```bash
make dev
```

If you prefer to run each step manually:

```bash
docker compose up -d postgres
npx prisma migrate deploy
npx prisma generate
npm run start:dev
```

### Windows PowerShell

```powershell
git clone <repository-url>
cd z-app-backend
npm install
Copy-Item deploy\.env.prod.example .env
```

Edit `.env` with local values, especially:

```env
POSTGRES_DB=zdb
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/zdb
MAIL_ENABLED=false
```

Then run:

```powershell
docker compose up -d postgres
npx prisma migrate deploy
npx prisma generate
npm run start:dev
```

## Environment Variables

| Variable | Required | Default / Behavior | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | No | unset | Runtime environment. Production mode affects Prisma shutdown hooks and mail behavior. |
| `PORT` | No | `3000` | HTTP port used by NestJS. |
| `DATABASE_URL` | Yes | none | PostgreSQL connection string used by Prisma. |
| `POSTGRES_DB` | Docker | `zdb` | Database name for Compose-managed PostgreSQL. |
| `POSTGRES_USER` | Docker | local: `postgres`, prod: `z_user` | PostgreSQL user for Compose. |
| `POSTGRES_PASSWORD` | Docker/local Makefile | local Compose defaults to `postgres` | PostgreSQL password for Compose and local `DATABASE_URL`. |
| `JWT_ACCESS_SECRET` | Recommended | fallback development string | Secret used to sign 15-minute access tokens. |
| `JWT_REFRESH_SECRET` | Recommended | fallback development string | Secret used to sign 30-day refresh tokens. |
| `GROQ_API_KEY` | No | local fallback when missing or placeholder-like | Enables Groq-backed email generation. |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` | Groq model name. |
| `DEEPGRAM_API_KEY` | Yes for speech | speech endpoint returns unavailable when missing | Enables audio transcription. |
| `DEEPGRAM_MODEL` | No | `nova-3` | Deepgram model name. |
| `MAIL_PROVIDER` | No | `brevo` | Only `brevo` is implemented. |
| `MAIL_ENABLED` | No | disabled unless set to `true` | Sends real verification emails when enabled. In development, disabled mail logs the code. In production, disabled mail errors. |
| `BREVO_API_KEY` | If mail enabled | none | Brevo Transactional Email API key. |
| `BREVO_FROM_NAME` | No | `Z` | Sender display name. |
| `BREVO_FROM_EMAIL` | If mail enabled | none | Verified Brevo sender email. |
| `BREVO_REPLY_TO` | No | omitted | Optional reply-to email. |
| `EMAIL_VERIFICATION_CODE_TTL_MINUTES` | No | `5` | Verification code expiry in minutes. |
| `EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS` | No | `60` | Minimum wait before resending a code. |
| `EMAIL_VERIFICATION_MAX_ATTEMPTS` | No | `5` | Maximum failed attempts per code. |
| `EMAIL_CODE_SECRET` | Recommended | fallback development string | HMAC secret used to hash verification codes. |
| `BACKEND_HOST_PORT` | Production Compose | `3002` | Host port mapped to the backend container. |
| `BACKEND_CONTAINER_PORT` | Production Compose | `3000` | Backend container port. |
| `POSTGRES_HOST_PORT` | Production Compose | `55432` | Optional host port mapped to PostgreSQL. |
| `POSTGRES_CONTAINER_PORT` | Production Compose | `5432` | PostgreSQL container port. |

## Database Setup

The project uses Prisma with PostgreSQL. The schema contains:

- `User`: registered users with email, name, password hash, refresh token hash, verification timestamp, and draft relationship.
- `EmailVerificationCode`: hashed email verification codes with expiry, attempt count, and used timestamp.
- `EmailDraft`: generated or saved email drafts owned by either a user or an anonymous device ID.

Run migrations:

```bash
npx prisma migrate deploy
```

Generate Prisma Client:

```bash
npx prisma generate
```

Open Prisma Studio:

```bash
npm run prisma:studio
```

For local development with Docker:

```bash
docker compose up -d postgres
```

To reset the local Docker database volume:

```bash
make reset-db
```

## Run Locally

Development mode with Docker PostgreSQL:

```bash
make dev
```

Development mode manually:

```bash
docker compose up -d postgres
npx prisma migrate deploy
npx prisma generate
npm run start:dev
```

Production build and start:

```bash
npm run build
npm run start:prod
```

Default local URLs:

- API base URL: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/api/docs`
- Health: `http://localhost:3000/api/v1/health`

## Available Scripts and Commands

### npm Scripts

| Command | Description |
| --- | --- |
| `npm run build` | Build the NestJS application into `dist/`. |
| `npm run format` | Format TypeScript files in `src/` with Prettier. |
| `npm run start` | Start the Nest application. |
| `npm run start:dev` | Start in watch mode. |
| `npm run start:debug` | Start in debug watch mode. |
| `npm run start:prod` | Start the built production app from `dist/main`. |
| `npm run lint` | Run ESLint with `--fix` on `src` and `test` TypeScript files. |
| `npm test` | Run Jest tests. |
| `npm run prisma:generate` | Generate Prisma Client. |
| `npm run prisma:migrate` | Run `prisma migrate dev`. |
| `npm run prisma:migrate:deploy` | Run deployment migrations. |
| `npm run prisma:studio` | Open Prisma Studio. |

### Makefile Commands

| Command | Description |
| --- | --- |
| `make dev` | Start local PostgreSQL, wait for it, deploy migrations, generate Prisma Client, and start dev server. |
| `make stop` | Stop local Compose services. |
| `make reset-db` | Remove local PostgreSQL volume, recreate DB, deploy migrations, and generate Prisma Client. |
| `make logs` | Follow local PostgreSQL logs. |
| `make prod-deploy` | Run `deploy/deploy.sh`. |
| `make prod-stop` | Stop production containers while preserving data. |
| `make prod-undeploy` | Remove production containers, optionally deleting database volume. |
| `make prod-monitor` | Show production status/logs. |
| `make prod-menu` | Open the production management menu. |

## API Documentation

Interactive Swagger documentation is available at:

```text
GET /api/docs
```

All API routes below are relative to:

```text
/api/v1
```

### Health

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | No | Returns service health. |

Example response:

```json
{
  "status": "ok",
  "service": "z-backend"
}
```

### Auth

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | No | Create an unverified user and send a verification code. |
| `POST` | `/auth/verify-email` | No | Verify a 6-digit email code and issue tokens. |
| `POST` | `/auth/resend-verification-code` | No | Resend a verification code for an unverified user. |
| `POST` | `/auth/login` | No | Login a verified user and issue tokens. |
| `POST` | `/auth/refresh` | No | Exchange a refresh token for new tokens. |
| `POST` | `/auth/logout` | Bearer | Clear the stored refresh token hash. |
| `GET` | `/auth/me` | Bearer | Return the authenticated user. |

Register request:

```json
{
  "email": "dev@z.local",
  "name": "Z Developer",
  "password": "password123"
}
```

Register response data:

```json
{
  "requiresEmailVerification": true,
  "email": "dev@z.local"
}
```

Verify email request:

```json
{
  "email": "dev@z.local",
  "code": "123456"
}
```

Login request:

```json
{
  "email": "dev@z.local",
  "password": "password123"
}
```

Token response data:

```json
{
  "user": {
    "id": "uuid",
    "email": "dev@z.local",
    "name": "Z Developer"
  },
  "accessToken": "jwt",
  "refreshToken": "jwt"
}
```

### Users

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/users/me` | Bearer | Return the authenticated user profile. |
| `PATCH` | `/users/me` | Bearer | Update the authenticated user's name. |

Update user request:

```json
{
  "name": "New Name"
}
```

### AI Email Generation

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/ai/generate-email` | No | Generate an email from a transcript. |

Request:

```json
{
  "transcript": "Hello, write me a professional email to Microsoft to ask for a meeting next week.",
  "tone": "professional",
  "customTone": "Concise and polite",
  "template": "meeting_request",
  "language": "en",
  "outputLanguage": "auto",
  "templateKey": "meeting_request"
}
```

Supported `tone` values:

```text
professional, administrative, friendly, student, formal, business, semi_formal,
executive, academic, legal, medical, hr, sales, customer_support, internship,
professor, research, technical, marketing, apologetic, persuasive, negotiation,
complaint, follow_up, reminder, urgent, luxury, minimalist
```

Supported `outputLanguage` values:

```text
auto, fr, en, ar, de, es, it, pt, nl, tr
```

Response data includes fields such as:

```json
{
  "subject": "Meeting request",
  "body": "Dear ...",
  "language": "en",
  "outputLanguage": "en",
  "purpose": "meeting",
  "recipient": "Microsoft",
  "detectedLanguage": "en",
  "confidence": 90,
  "extractedEntities": {},
  "suggestedRecipient": "Microsoft",
  "tone": "professional",
  "intent": "meeting",
  "provider": "groq"
}
```

When `GROQ_API_KEY` is missing or placeholder-like, the endpoint returns output from the local fallback generator with `provider` set to `local-fallback`.

### Speech

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/speech/transcribe` | No | Transcribe an uploaded audio file through Deepgram. |

The endpoint consumes `multipart/form-data`.

Accepted file fields:

- `audio`
- `file`

Supported MIME types:

- `audio/m4a`
- `audio/mp4`
- `audio/wav`
- `audio/webm`
- `audio/mpeg`
- `audio/mp3`

Supported language selections:

```text
auto, fr, en, ar, de, es, it, pt, nl, tr
```

Example curl:

```bash
curl -X POST http://localhost:3000/api/v1/speech/transcribe \
  -F "audio=@voice.m4a" \
  -F "language=auto"
```

Raw response:

```json
{
  "transcript": "Hello, write an email in German.",
  "detectedLanguage": "en",
  "language": "en",
  "confidence": 0.9,
  "duration": 1.2
}
```

### Drafts

Draft routes use `OptionalJwtAuthGuard`:

- If a valid bearer token is present, drafts are owned by the authenticated user.
- If no token is present, requests must include `X-Device-Id` and drafts are owned by that device ID.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/drafts` | Optional Bearer or `X-Device-Id` | Create a draft. |
| `GET` | `/drafts` | Optional Bearer or `X-Device-Id` | List drafts for the current user/device. |
| `PATCH` | `/drafts/:id/status` | Optional Bearer or `X-Device-Id` | Update draft status. |
| `POST` | `/drafts/:id/duplicate` | Optional Bearer or `X-Device-Id` | Duplicate a draft as a new draft. |
| `DELETE` | `/drafts/:id` | Optional Bearer or `X-Device-Id` | Soft-delete a draft by setting status to `deleted`. |
| `POST` | `/drafts/claim-device-drafts` | Bearer | Move anonymous drafts for a device onto the authenticated user. |

Create draft request:

```json
{
  "recipient": "Microsoft",
  "subject": "Meeting request",
  "body": "Dear ...",
  "tone": "professional",
  "transcript": "Original transcript",
  "templateKey": "meeting_request"
}
```

Allowed draft statuses:

```text
draft, scheduled, opened_in_mail_app, deleted
```

Claim anonymous drafts request:

```json
{
  "deviceId": "device-123"
}
```

## Authentication Flow

1. Client calls `POST /api/v1/auth/register` with email, name, and password.
2. Backend creates the user with `emailVerifiedAt = null`.
3. Backend creates a 6-digit verification code, stores only its HMAC hash, and sends the code by mail.
4. In development with `MAIL_ENABLED=false`, the verification code is logged instead of sent.
5. Client calls `POST /api/v1/auth/verify-email` with email and code.
6. Backend marks the code as used, sets `emailVerifiedAt`, and returns access and refresh tokens.
7. Client sends the access token as `Authorization: Bearer <token>` for protected routes.
8. Client calls `POST /api/v1/auth/refresh` with the refresh token when a new token pair is needed.
9. Backend stores only a bcrypt hash of the latest refresh token.
10. Client calls `POST /api/v1/auth/logout` to clear the stored refresh token hash.

Unverified users cannot log in. Login returns an `EMAIL_NOT_VERIFIED` code in the error body.

## Frontend Routes / Screens

No frontend application exists in this repository. This project contains only the backend API.

## Deployment

### Docker Image

Build the production image:

```bash
docker build -t z-backend .
```

The production container:

- installs production dependencies,
- includes Prisma CLI for deployment migrations,
- runs `npx prisma migrate deploy` before starting,
- starts `node dist/main.js`,
- exposes container port `3000`.

### Production Docker Compose

Production deployment files live in `deploy/`.

First deploy:

```bash
make prod-deploy
```

On first run, `deploy/deploy.sh` creates `deploy/.env.prod` from `deploy/.env.prod.example` and stops. Edit `deploy/.env.prod` with real secrets, then rerun:

```bash
make prod-deploy
```

Direct script usage:

```bash
cd deploy
./deploy.sh
```

Production services:

- `z_backend`: NestJS API container, host port `3002` by default.
- `z_postgres`: PostgreSQL container, host debug port `55432` by default.

Production URLs by default:

- Backend: `http://<VPS_IP>:3002`
- API base: `http://<VPS_IP>:3002/api/v1`
- Swagger: `http://<VPS_IP>:3002/api/docs`
- Health: `http://<VPS_IP>:3002/api/v1/health`

Operational commands:

```bash
make prod-stop
make prod-monitor
make prod-menu
make prod-undeploy
```

Direct monitor commands:

```bash
cd deploy
./monitor.sh
./monitor.sh logs
./monitor.sh postgres-logs
./monitor.sh stats
./monitor.sh ps
```

Firewall example:

```bash
sudo ufw allow 3002/tcp
```

Avoid exposing PostgreSQL publicly. If temporary host debugging is needed, restrict `55432` to your IP.

## Testing

Run all tests:

```bash
npm test
```

The current tests cover:

- AI fallback generation across supported languages.
- Output-language prioritization.
- Recipient, date, and intent extraction behavior.
- Groq retry/fallback behavior for malformed provider responses.
- Prompt-injection handling in the local fallback path.
- Deepgram retry behavior and error handling in speech transcription.

Run a production build:

```bash
npm run build
```

Run lint with auto-fix:

```bash
npm run lint
```

## Troubleshooting

### `make dev` cannot connect to PostgreSQL

Ensure `.env` contains a local password and matching database URL:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=zdb
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/zdb
```

Then restart the database:

```bash
docker compose down
docker compose up -d postgres
```

### Prisma Client is missing or stale

Run:

```bash
npx prisma generate
```

### Migrations were not applied

Run:

```bash
npx prisma migrate deploy
```

### Speech endpoint returns `Deepgram API key missing`

Set `DEEPGRAM_API_KEY` in `.env`. The speech endpoint requires a valid Deepgram key.

### Speech endpoint returns `Format audio non supporté.`

Upload one of the supported audio MIME types, or ensure the file extension allows the service to infer the MIME type for `m4a`, `mp4`, `wav`, `webm`, `mp3`, or `mpeg`.

### Registration does not send email in development

If `MAIL_ENABLED=false`, the app logs the verification code instead of sending email. Set `MAIL_ENABLED=true` and configure Brevo variables to send real email.

### Production registration fails with mail disabled

In `NODE_ENV=production`, disabled mail delivery throws an error. Configure:

```env
MAIL_ENABLED=true
MAIL_PROVIDER=brevo
BREVO_API_KEY=...
BREVO_FROM_EMAIL=your_verified_sender@example.com
```

### Groq generation is not being used

Set `GROQ_API_KEY` to a real key. Without it, email generation uses the local fallback generator.

### Swagger route does not include `/api/v1`

Swagger UI is mounted at `/api/docs`, while application API routes use `/api/v1`.

## Contribution Guide

1. Create a feature branch.
2. Keep changes scoped to the relevant module.
3. Add or update tests when behavior changes.
4. Run checks before opening a pull request:

```bash
npm run build
npm test
npm run lint
```

5. Do not commit `.env`, `deploy/.env.prod`, database volumes, build output, coverage output, or local logs.
6. Document new environment variables, routes, scripts, and deployment steps in this README.

## Missing Information / To Complete

- No root `.env.example` file exists. The current setup uses `deploy/.env.prod.example`; a local `.env.example` should be added for development.
- No CI/CD workflow files were found in the repository.
- No formal API versioning strategy beyond the global `/api/v1` prefix is documented in code.
- No seed script is present.
- No repository URL, production domain, or HTTPS reverse-proxy configuration is included.
- No frontend app exists in this repository.

## License

This package is marked as `UNLICENSED` in `package.json`.
