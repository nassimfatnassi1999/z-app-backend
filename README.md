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
