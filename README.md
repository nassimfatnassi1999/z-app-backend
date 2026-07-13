# Z Backend

NestJS API for local Z development. Z is now a voice-to-professional-message
app with internal discussions between users.

## Local Setup

```bash
cp .env.example .env
npm install
make dev
```

The API runs on port `3000` and listens on all interfaces, so devices on the same Wi-Fi can reach `http://<MAC_LOCAL_IP>:3000/api/v1`.
Swagger is available at `http://<MAC_LOCAL_IP>:3000/api/docs`.
Health is available at `http://<MAC_LOCAL_IP>:3000/health`.

## Production deployment

Production uses `deploy/.env.prod`, never an implicit shell environment. On an
existing installation, newly-required variables are copied from the configured
root `.env` only when they are absent from `.env.prod`; deployment-specific
values already present in `.env.prod` are preserved.

```bash
make prod-deploy
make doctor
```

The deploy command validates required variables before touching Docker, stops
the old stack, performs a no-cache build, force-recreates containers, waits for
the Nest healthcheck, verifies Prisma migration status and prints sanitized
service logs. See `deploy/Deployment.md` for first deployment, updates and
rollback.

## Deepgram Speech Languages

No special Deepgram account configuration is usually required for language
selection. The API controls transcription language through request options:

- `auto` omits `language` and uses `detect_language=true`.
- `fr`, `en`, `de`, `es`, `it`, `pt`, `nl`, and `tr` force the matching
  Deepgram `language` option.
- Requests use `smart_format=true`, `punctuate=true`, `paragraphs=true`,
  `utterances=true`, `diarize=false`, and `DEEPGRAM_MODEL` when set, defaulting
  to `nova-2-general`.

The backend normalizes responses to:

```json
{
  "transcript": "...",
  "language": "fr",
  "confidence": 0.97,
  "duration": 4.2
}
```

`language` is one of `fr`, `en`, `de`, `es`, `it`, `pt`, `nl`, `tr`, or
`unknown`. If automatic detection confidence is below `0.55`, the API returns
`unknown`.

To add another Deepgram language, add its code to
`src/modules/speech/languageMap.ts`. Then add the matching display label to the
Flutter language list.

## Email Verification

Registration creates an unverified user, sends a 6-digit code, and returns:

```json
{
  "requiresEmailVerification": true,
  "email": "user@example.com"
}
```

The user must complete `POST /auth/verify-email` before tokens are issued.
Codes expire after 5 minutes, old unused codes are invalidated on resend, and
only hashed codes are stored.

Mail is sent through Brevo Transactional Email:

```env
MAIL_PROVIDER=brevo
MAIL_ENABLED=true
BREVO_API_KEY=
BREVO_FROM_NAME=Z
BREVO_FROM_EMAIL=your_verified_sender@example.com
BREVO_REPLY_TO=
EMAIL_VERIFICATION_CODE_TTL_MINUTES=5
EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS=60
EMAIL_VERIFICATION_MAX_ATTEMPTS=5
EMAIL_CODE_SECRET=change_me_long_random_secret
```

`BREVO_FROM_EMAIL` must be verified in Brevo. Brevo is used only for account
verification emails, not generated message delivery. In development,
`MAIL_ENABLED=false` skips Brevo and logs the verification code. In production,
disabled mail returns an error.

## Usernames

Registration requires a unique lowercase username. Rules:

- 3-24 characters.
- Allowed characters: `a-z`, `0-9`, `_`, `.`.
- Reserved usernames: `admin`, `support`, `z`, `system`, `root`.

Endpoints:

- `GET /api/v1/users/check-username?username=nassim`
- `GET /api/v1/users/search?q=achref` with bearer auth

User search returns `id`, `name`, `username`, and `avatarInitials`. It excludes
the current user and never returns email addresses.

## Conversations

Endpoints:

- `POST /api/v1/conversations/direct` with `{ "userId": "..." }`
- `GET /api/v1/conversations`
- `GET /api/v1/conversations/:id/messages?page=1&limit=30`
- `POST /api/v1/conversations/:id/messages`
- `POST /api/v1/conversations/:id/messages/generated-email`
- `DELETE /api/v1/messages/:id`

Only participants can read or write conversations. Generated drafts remain
owned by their author and can be sent as `generated_email` messages.

## WebSocket Chat

Socket.IO is served by the Nest app. Connect with:

```js
io(API_BASE_URL, { auth: { token: accessToken }, transports: ["websocket"] })
```

Client events:

- `conversation:join { conversationId }`
- `conversation:leave { conversationId }`
- `message:send { conversationId, content, messageType }`
- `typing:start { conversationId }`
- `typing:stop { conversationId }`
- `message:read { conversationId }`

Server events:

- `message:new`
- `message:deleted`
- `conversation:updated`
- `typing:update`
- `message:read`

## Internal email push notifications

The authenticated device endpoints are `POST /notifications/devices`, `DELETE
/notifications/devices/:token`, `GET /notifications/settings`, and `PATCH
/notifications/settings`. Configure Firebase Admin with either the three
`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` values,
or `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`. Missing or temporarily failing
Firebase never blocks internal email creation. Invalid FCM tokens are revoked.

`GET /mailbox/counts` supplies inbox-unread, unread, draft, and trash badges.
