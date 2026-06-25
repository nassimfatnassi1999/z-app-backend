import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'dev@z.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Z Developer' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}
