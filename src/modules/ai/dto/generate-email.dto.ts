import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class GenerateEmailDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  transcript!: string;

  @ApiPropertyOptional({
    enum: ['professional', 'administrative', 'friendly', 'student', 'formal', 'business'],
  })
  @IsOptional()
  @IsIn(['professional', 'administrative', 'friendly', 'student', 'formal', 'business'])
  tone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateKey?: string;
}
