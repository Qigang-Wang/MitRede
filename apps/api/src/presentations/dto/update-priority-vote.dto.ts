import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class UpdatePriorityVoteDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  question!: string;

  @IsOptional()
  @IsString()
  sourceGroupNodeId?: string | null;

  @IsInt()
  @Min(1)
  @Max(10)
  maxVotes!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxVisibleResults?: number;

  @IsIn(["MANUAL", "LIVE"])
  resultDisplayMode!: "MANUAL" | "LIVE";
}
