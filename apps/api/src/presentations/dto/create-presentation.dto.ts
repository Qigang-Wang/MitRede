import { IsString, MaxLength, MinLength } from "class-validator";

export class CreatePresentationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;
}

