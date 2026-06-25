import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ResendVerificationCodeDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}
