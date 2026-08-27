import { IsString, MaxLength } from "class-validator";

export class UpdateSettingsDto {
  @IsString()
  @MaxLength(255)
  publicBaseUrl!: string;
}
