import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'dev@z.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Z Developer' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'z_dev' })
  @IsString()
  @MinLength(3)
  @MaxLength(24)
  @Matches(/^[a-z0-9_.]+$/)
  username!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
