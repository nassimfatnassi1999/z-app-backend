import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
  @IsString()
  templateKey?: string;
}
