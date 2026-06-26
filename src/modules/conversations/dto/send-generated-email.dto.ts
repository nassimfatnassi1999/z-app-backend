import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SendGeneratedEmailDto {
  @ApiProperty()
  @IsUUID()
  draftId!: string;
}
