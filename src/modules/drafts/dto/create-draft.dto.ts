import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EmailAttachmentDto } from '../../mailbox/dto/send-email.dto';

export class CreateDraftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(320)
  recipient?: string;

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

  @ApiProperty()
  @IsString()
  @MaxLength(50)
  tone!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(20000)
  transcript!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateKey?: string;

  @ApiPropertyOptional({ type: [EmailAttachmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmailAttachmentDto)
  attachments?: EmailAttachmentDto[];
}
