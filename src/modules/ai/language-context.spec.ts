import { detectRequestedOutputLanguage, resolveEffectiveOutputLanguage } from './language-context';
import { normalizeLanguageCode } from '../speech/languageMap';

describe('voice language context', () => {
  it.each([
    ['fr-FR', 'fr'],
    ['en_US', 'en'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeLanguageCode(input)).toBe(expected);
  });

  it('detects a French request for English output', () => {
    expect(detectRequestedOutputLanguage("Rédige l'email final en anglais.")).toBe('en');
  });

  it('detects an English request for French output', () => {
    expect(detectRequestedOutputLanguage('Write the final email in French.')).toBe('fr');
  });

  it('resolves output using the required priority', () => {
    expect(
      resolveEffectiveOutputLanguage({
        requestedOutputLanguage: 'de',
        transcriptRequestedLanguage: 'fr',
        detectedSpeechLanguage: 'en',
        speechLanguageMode: 'es',
        appLanguage: 'ar',
      }),
    ).toBe('de');
  });

  it('uses detected speech language when no output language is requested', () => {
    expect(
      resolveEffectiveOutputLanguage({
        detectedSpeechLanguage: 'fr-FR',
        speechLanguageMode: 'auto',
      }),
    ).toBe('fr');
  });

  it('falls back to English only when no language is known', () => {
    expect(resolveEffectiveOutputLanguage({ speechLanguageMode: 'auto' })).toBe('en');
  });
});
