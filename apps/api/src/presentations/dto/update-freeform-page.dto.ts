import { ArrayMaxSize, IsArray, IsHexColor, IsObject } from "class-validator";

export class UpdateFreeformPageDto {
  @IsHexColor()
  backgroundColor!: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsObject({ each: true })
  elements!: Record<string, unknown>[];
}
