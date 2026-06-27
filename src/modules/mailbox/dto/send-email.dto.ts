import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class SendEmailDto {
  @ApiProperty()
  @IsString()
  recipientId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  subject!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  replyToEmailId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  draftId?: string;
}
