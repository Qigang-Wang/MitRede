import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class UpdateSessionDto {
  @IsOptional()
  @IsIn(["NOT_OPEN", "ACCEPTING", "LOCKED"])
  interactionStatus?: "NOT_OPEN" | "ACCEPTING" | "LOCKED";

  @IsOptional()
  @IsBoolean()
  resultsVisible?: boolean;

  @IsOptional()
  @IsString()
  currentNodeId?: string;

  @IsOptional()
  @IsIn(["START", "PAUSE", "RESET", "ADD_MINUTE"])
  timerAction?: "START" | "PAUSE" | "RESET" | "ADD_MINUTE";

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  activeGroupIndex?: number;
}
