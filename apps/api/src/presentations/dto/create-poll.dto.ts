import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

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
}
