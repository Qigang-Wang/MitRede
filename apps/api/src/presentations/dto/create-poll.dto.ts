import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class CreatePollDto {
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  question!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(120, { each: true })
  options!: string[];

  @IsOptional()
  @IsIn(["MANUAL", "LIVE"])
  resultDisplayMode?: "MANUAL" | "LIVE";

  @IsOptional()
  @IsIn(["FEEDBACK", "QUIZ"])
  assessmentMode?: "FEEDBACK" | "QUIZ";

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7)
  correctOptionIndex?: number;
}
