import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RegisterDeviceDto {
  @IsString() @IsNotEmpty() @MaxLength(4096) token!: string;
  @IsIn(['ios', 'android']) platform!: 'ios' | 'android';
  @IsString() @IsNotEmpty() @MaxLength(200) deviceId!: string;
  @IsString() @IsNotEmpty() @MaxLength(50) appVersion!: string;
}
