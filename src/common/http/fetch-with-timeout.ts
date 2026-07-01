import { ServiceUnavailableException } from '@nestjs/common';

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  options: { timeoutMs?: number; retries?: number; retryStatuses?: number[]; errorMessage: string },
) {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const retries = options.retries ?? 0;
  const retryStatuses = new Set(options.retryStatuses ?? [429, 502, 503, 504]);
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.ok || attempt === retries || !retryStatuses.has(response.status))
        return response;
      await response.body?.cancel();
    } catch (error) {
      if (attempt === retries) {
        throw new ServiceUnavailableException(options.errorMessage, { cause: error });
      }
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt + Math.random() * 100));
  }
  throw new ServiceUnavailableException(options.errorMessage);
}
