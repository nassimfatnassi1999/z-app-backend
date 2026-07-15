'use strict';

const port = process.env.PORT || '3000';
const path = process.env.HEALTHCHECK_PATH || '/api/v1/health';
const url = `http://127.0.0.1:${port}${path}`;
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 4000);

fetch(url, { signal: controller.signal })
  .then(async (response) => {
    const body = await response.text().catch(() => '');
    clearTimeout(timeout);
    if (!response.ok) {
      console.error(`Healthcheck failed: HTTP ${response.status} ${body.slice(0, 1000)}`);
      process.exit(1);
    }
    console.log(`Healthcheck OK: HTTP ${response.status} ${body.slice(0, 1000)}`);
    process.exit(0);
  })
  .catch((error) => {
    clearTimeout(timeout);
    const reason = error.name === 'AbortError' ? `timeout after 4000ms for ${url}` : error.message;
    console.error(`Healthcheck request failed: ${reason}`);
    process.exit(1);
  });
