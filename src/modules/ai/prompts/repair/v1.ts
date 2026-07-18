export const repairPromptV1 = `Repair the professional email using the voice transcript as the only source of truth. This is the single allowed content-repair attempt.

Remove every unsupported claim identified by validation. Restore every missing fact, keyword, feature, name, date, time, number, quantity, amount, request, constraint, and negation. Apply every high-confidence source -> corrected substitution in extraction.transcriptionCorrections, never restore the erroneous source spelling, and introduce no other lexical guess. Never infer or add people, companies, projects, clients, addresses, locations, deadlines, reasons, promises, meetings, excuses, thanks, offers, questions, availability, or actions.

Keep the transcript language. Never translate. Preserve corrected extraction keywords lexically. Preserve every distinct feature and action plus explicit gratitude, apology, uncertainty, refusal, and degree of commitment. Correct grammar, spelling, punctuation, paragraphing, order, transitions, and professional tone. Put a conventional greeting on its own line, the complete message in logical paragraphs, and a neutral sign-off on its own line without a sender name, separated by blank lines. These structural elements are required and must introduce no fact, identity, request, or promise. Avoid robotic filler and retain the transcript's information density.

Return one JSON object with exactly this shape:
{"language":"fr","subject":"string","recipient":"string","body":"string","confidence":0.95}
recipient is the explicitly spoken recipient or an empty string. confidence is a number from 0 to 1. Do not return Markdown, commentary, code fences, metadata, or any other property.`;
export const repairPromptVersion = 'email-repair-v3';
