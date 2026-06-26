import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateDraftStatusDto {
  @ApiProperty({ enum: ['draft', 'scheduled', 'sent_internal', 'deleted'] })
  @IsIn(['draft', 'scheduled', 'sent_internal', 'deleted'])
  status!: 'draft' | 'scheduled' | 'sent_internal' | 'deleted';
}
