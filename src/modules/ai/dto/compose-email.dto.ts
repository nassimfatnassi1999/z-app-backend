import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ComposeEmailDto {
  @IsString() @MinLength(3) @MaxLength(20_000) transcript!: string;
  @IsOptional() @IsString() @MaxLength(12) language?: string;
  @IsOptional() @IsString() @MaxLength(40) tone?: string;
  @IsOptional() @IsString() @MaxLength(50_000) previousEmail?: string;
}
