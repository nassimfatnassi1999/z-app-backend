import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMessageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  content!: string;

  @ApiPropertyOptional({ enum: ['text', 'generated_email'] })
  @IsOptional()
  @IsIn(['text', 'generated_email'])
  messageType?: 'text' | 'generated_email';
}
