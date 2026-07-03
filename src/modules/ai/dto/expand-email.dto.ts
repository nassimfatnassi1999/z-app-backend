import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ExpandEmailDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(50000)
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  language?: string;

  @ApiPropertyOptional({ enum: ['light', 'medium', 'full'], default: 'medium' })
  @IsOptional()
  @IsIn(['light', 'medium', 'full'])
  expandLevel?: 'light' | 'medium' | 'full';
}
