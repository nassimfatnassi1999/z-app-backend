import { IsObject, IsString, MaxLength, MinLength } from 'class-validator';
export class ValidateEmailDto {
  @IsString() @MinLength(3) @MaxLength(20_000) transcript!: string;
  @IsObject() extraction!: Record<string, unknown>;
  @IsObject() email!: Record<string, unknown>;
}
