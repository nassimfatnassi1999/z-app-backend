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
    enum: ['professional', 'administrative', 'friendly', 'student', 'formal', 'business'],
  })
  @IsOptional()
  @IsIn(['professional', 'administrative', 'friendly', 'student', 'formal', 'business'])
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
