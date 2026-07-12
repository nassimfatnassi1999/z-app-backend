import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class GenerateEmailDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(20000)
  transcript!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50000)
  currentBody?: string;

  @ApiPropertyOptional({
    enum: [
      'auto',
      'professional',
      'administrative',
      'friendly',
      'urgent',
      'direct',
      'apology',
      'follow_up',
      'complaint',
      'information_request',
      'student',
      'formal',
      'business',
      'custom',
    ],
  })
  @IsOptional()
  @IsIn([
    'auto',
    'professional',
    'administrative',
    'friendly',
    'urgent',
    'direct',
    'apology',
    'follow_up',
    'complaint',
    'information_request',
    'student',
    'formal',
    'business',
    'custom',
  ])
  tone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customTone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  template?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['auto', 'fr', 'en', 'ar', 'de', 'es', 'it', 'pt', 'nl', 'tr'])
  speechLanguageMode?: 'auto' | 'fr' | 'en' | 'ar' | 'de' | 'es' | 'it' | 'pt' | 'nl' | 'tr';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  detectedSpeechLanguage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  requestedOutputLanguage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  appLanguage?: string;

  /** Resolved by the service; not accepted as authoritative client input. */
  effectiveOutputLanguage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  speechConfidence?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateKey?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) recipientName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) relationship?: string;
  @ApiPropertyOptional({ enum: ['short', 'medium', 'long', 'auto'] })
  @IsOptional()
  @IsIn(['short', 'medium', 'long', 'auto'])
  length?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) intent?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) emailType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) userContext?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) history?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) requestId?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['fast', 'advanced']) qualityMode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) userInstruction?: string;

  @ApiPropertyOptional({ enum: ['light', 'medium', 'full'], default: 'medium' })
  @IsOptional()
  @IsIn(['light', 'medium', 'full'])
  enrichmentLevel?: 'light' | 'medium' | 'full';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceGenerationId?: string;
}
