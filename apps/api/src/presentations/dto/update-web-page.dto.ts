import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength, MinLength } from "class-validator";

export class UpdateWebPageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  title!: string;

  @IsString()
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @MaxLength(2048)
  url!: string;

  @IsOptional()
  @IsBoolean()
  interactive?: boolean;
}
