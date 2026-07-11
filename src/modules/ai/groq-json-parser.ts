export class InvalidGroqJsonError extends Error {}

export function parseGroqJson(content: unknown): Record<string, any> {
  const text = String(content ?? '').trim();
  if (!text) throw new InvalidGroqJsonError('Groq returned empty content');
  const withoutFence = text
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```/g, '')
    .trim();
  const candidates = [withoutFence];
  for (
    let start = withoutFence.indexOf('{');
    start >= 0;
    start = withoutFence.indexOf('{', start + 1)
  ) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < withoutFence.length; index += 1) {
      const char = withoutFence[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\' && quoted) {
        escaped = true;
        continue;
      }
      if (char === '"') quoted = !quoted;
      if (quoted) continue;
      if (char === '{') depth += 1;
      if (char === '}' && --depth === 0) {
        candidates.push(withoutFence.slice(start, index + 1));
        break;
      }
    }
  }
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    } catch {
      /* try the next balanced object */
    }
  }
  throw new InvalidGroqJsonError('No valid JSON object in Groq content');
}
