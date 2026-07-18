import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { EmailStatus } from '../../../common/enums/email-status.enum';

export class UpdateDraftStatusDto {
  @ApiProperty({ enum: EmailStatus })
  @IsEnum(EmailStatus)
  status!: EmailStatus;
}
