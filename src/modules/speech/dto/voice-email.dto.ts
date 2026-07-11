import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const modes = ['auto', 'fr', 'en', 'ar', 'de', 'es', 'it', 'pt', 'nl', 'tr'] as const;

export class VoiceEmailDto {
  @IsOptional()
  @IsIn(modes)
  speechLanguageMode: (typeof modes)[number] = 'auto';

  /** Legacy alias retained for older mobile clients. */
  @IsOptional()
  @IsIn(modes)
  language?: (typeof modes)[number];

  @IsOptional()
  @IsString()
  @MaxLength(20)
  requestedOutputLanguage?: string;
}
