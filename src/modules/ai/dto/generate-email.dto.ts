import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const allowedTones = [
  'professional',
  'administrative',
  'friendly',
  'student',
  'formal',
  'business',
  'semi_formal',
  'executive',
  'academic',
  'legal',
  'medical',
  'hr',
  'sales',
  'customer_support',
  'internship',
  'professor',
  'research',
  'technical',
  'marketing',
  'apologetic',
  'persuasive',
  'negotiation',
  'complaint',
  'follow_up',
  'reminder',
  'urgent',
  'luxury',
  'minimalist',
];

export class GenerateEmailDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  transcript!: string;

  @ApiPropertyOptional({
    enum: allowedTones,
  })
  @IsOptional()
  @IsIn(allowedTones)
  tone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customTone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  template?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({
    enum: ['auto', 'fr', 'en', 'ar', 'de', 'es', 'it', 'pt', 'nl', 'tr'],
  })
  @IsOptional()
  @IsString()
  outputLanguage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateKey?: string;
}
