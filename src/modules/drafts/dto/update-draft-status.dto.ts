import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateDraftStatusDto {
  @ApiProperty({ enum: ['draft', 'scheduled', 'opened_in_mail_app', 'deleted'] })
  @IsIn(['draft', 'scheduled', 'opened_in_mail_app', 'deleted'])
  status!: 'draft' | 'scheduled' | 'opened_in_mail_app' | 'deleted';
}
