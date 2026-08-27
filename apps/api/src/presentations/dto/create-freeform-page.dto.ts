import { IsIn, IsOptional } from "class-validator";

export class CreateFreeformPageDto {
  @IsOptional()
  @IsIn(["BLANK", "TITLE_BODY"])
  template?: "BLANK" | "TITLE_BODY";
}
