# Z Backend

NestJS API for local Z development.

## Local Setup

```bash
cp .env.example .env
npm install
make dev
```

The API runs on port `3000` and listens on all interfaces, so devices on the same Wi-Fi can reach `http://<MAC_LOCAL_IP>:3000/api/v1`.
Swagger is available at `http://<MAC_LOCAL_IP>:3000/api/docs`.
Health is available at `http://<MAC_LOCAL_IP>:3000/health`.

## Deepgram Speech Languages

No special Deepgram account configuration is usually required for language
selection. The API controls transcription language through request options:

- `auto` omits `language` and uses `detect_language=true`.
- `fr`, `en`, `ar`, `de`, `es`, `it`, `pt`, `nl`, and `tr` force the matching
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

`language` is one of `fr`, `en`, `ar`, `de`, `es`, `it`, `pt`, `nl`, `tr`, or
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

`BREVO_FROM_EMAIL` must be verified in Brevo. In development,
`MAIL_ENABLED=false` skips Brevo and logs the verification code. In production,
disabled mail returns an error.
