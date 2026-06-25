import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDraftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recipient?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  subject!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  body!: string;

  @ApiProperty()
  @IsString()
  tone!: string;

  @ApiProperty()
  @IsString()
  transcript!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateKey?: string;
}
