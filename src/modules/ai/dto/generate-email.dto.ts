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
}
