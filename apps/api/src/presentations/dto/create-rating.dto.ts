import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class CreateRatingDto {
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  question!: string;

  @IsInt()
  @Min(0)
  @Max(9)
  min!: number;

  @IsInt()
  @Min(2)
  @Max(10)
  max!: number;

  @IsString()
  @MaxLength(60)
  minLabel!: string;

  @IsString()
  @MaxLength(60)
  maxLabel!: string;

  @IsOptional()
  @IsIn(["MANUAL", "LIVE"])
  resultDisplayMode?: "MANUAL" | "LIVE";
}
