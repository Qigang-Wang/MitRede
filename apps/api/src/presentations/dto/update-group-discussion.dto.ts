import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class UpdateGroupDiscussionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  question!: string;

  @IsString()
  @MaxLength(1000)
  prompt!: string;

  @IsString()
  @MaxLength(300)
  resultPrompt!: string;

  @IsOptional()
  @IsString()
  sourceGroupNodeId?: string | null;

  @IsInt()
  @Min(0)
  @Max(180)
  durationMinutes!: number;

  @IsInt()
  @Min(0)
  @Max(12)
  maxAnswers!: number;
}
