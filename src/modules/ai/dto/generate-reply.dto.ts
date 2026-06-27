import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

class OriginalEmailDto {
  @IsString() @IsNotEmpty() subject!: string;
  @IsString() @IsNotEmpty() body!: string;
  @IsString() @IsNotEmpty() senderName!: string;
}

export class GenerateReplyDto {
  @IsObject()
  @ValidateNested()
  @Type(() => OriginalEmailDto)
  originalEmail!: OriginalEmailDto;

  @IsString()
  @IsNotEmpty()
  replyInstruction!: string;

  @IsOptional() @IsString() language?: string;
  @IsOptional()
  @IsIn(['professional', 'administrative', 'friendly', 'student', 'formal', 'business'])
  tone?: string;
}
