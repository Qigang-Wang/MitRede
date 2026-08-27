import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class CreateRatingDto {
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  question!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(240, { each: true })
  statements?: string[];

  @IsInt()
  @Min(0)
  @Max(99)
  min!: number;

  @IsInt()
  @Min(1)
  @Max(100)
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
