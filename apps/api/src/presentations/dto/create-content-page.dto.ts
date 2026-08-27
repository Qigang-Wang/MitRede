import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateContentPageDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  eyebrow?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(180)
  title!: string;

  @IsString()
  @MaxLength(5000)
  body!: string;
}
