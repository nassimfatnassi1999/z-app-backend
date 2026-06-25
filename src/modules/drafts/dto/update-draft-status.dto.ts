import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateDraftStatusDto {
  @ApiProperty({ enum: ['draft', 'opened_in_mail_app'] })
  @IsIn(['draft', 'opened_in_mail_app'])
  status!: 'draft' | 'opened_in_mail_app';
}
