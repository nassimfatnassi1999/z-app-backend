import { InvalidGroqJsonError, parseGroqJson } from './groq-json-parser';

describe('parseGroqJson', () => {
  it('parses a valid JSON object', () =>
    expect(parseGroqJson('{"subject":"Test"}')).toEqual({ subject: 'Test' }));
  it('parses JSON in a markdown fence', () =>
    expect(parseGroqJson('```json\n{"subject":"Test"}\n```')).toEqual({ subject: 'Test' }));
  it('extracts JSON surrounded by prose', () =>
    expect(parseGroqJson('Result: {"subject":"Test"} done')).toEqual({ subject: 'Test' }));
  it('rejects an empty response explicitly', () =>
    expect(() => parseGroqJson('')).toThrow(InvalidGroqJsonError));
});
