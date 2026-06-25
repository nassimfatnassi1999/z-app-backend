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

- `auto` and `fr-en` use `detect_language=true`.
- `fr`, `en`, and `ar` force `language=fr`, `language=en`, or `language=ar`.
- Requests use `smart_format=true`, `punctuate=true`, and `DEEPGRAM_MODEL` when
  set, defaulting to `nova-2-general`.

If Arabic or multilingual detection fails, verify that the selected model
supports the language, the account has access to that model, and try forcing
`fr`, `en`, or `ar` from Settings. Depending on account availability, try
`DEEPGRAM_MODEL=nova-2-general` or `DEEPGRAM_MODEL=nova-3-general`.
