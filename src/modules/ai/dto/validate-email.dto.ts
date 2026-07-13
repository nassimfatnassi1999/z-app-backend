import { IsObject, IsString, MaxLength, MinLength } from 'class-validator';
import { GeneratedEmail, TranscriptExtraction } from '../schemas/ai.schemas';

export class ValidateEmailDto {
  @IsString() @MinLength(3) @MaxLength(20_000) transcript!: string;
  @IsObject() extraction!: TranscriptExtraction;
  @IsObject() email!: GeneratedEmail;
}
