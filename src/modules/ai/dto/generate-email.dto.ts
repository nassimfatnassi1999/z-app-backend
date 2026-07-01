import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class GenerateEmailDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  transcript!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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
  customTone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  template?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateKey?: string;
}
