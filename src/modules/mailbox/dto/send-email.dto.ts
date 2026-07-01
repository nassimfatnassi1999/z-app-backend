import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SendEmailDto {
  @ApiProperty()
  @IsString()
  @IsUUID()
  recipientId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subject!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(50000)
  body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
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
