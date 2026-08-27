import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateGroupPresentationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  question!: string;

  @IsOptional()
  @IsString()
  sourceGroupNodeId?: string | null;
}
