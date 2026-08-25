import { IsBoolean, IsIn, IsOptional } from "class-validator";

export class UpdateSessionDto {
  @IsOptional()
  @IsIn(["NOT_OPEN", "ACCEPTING", "LOCKED"])
  interactionStatus?: "NOT_OPEN" | "ACCEPTING" | "LOCKED";

  @IsOptional()
  @IsBoolean()
  resultsVisible?: boolean;
}

