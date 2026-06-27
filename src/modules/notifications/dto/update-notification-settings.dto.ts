import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @IsBoolean() @IsOptional() newEmails?: boolean;
  @IsBoolean() @IsOptional() sound?: boolean;
  @IsBoolean() @IsOptional() vibration?: boolean;
}
