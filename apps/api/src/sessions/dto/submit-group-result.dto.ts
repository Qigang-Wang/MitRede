import { IsArray, IsBoolean, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class SubmitGroupResultDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  participantToken!: string;

  @IsString()
  nodeId!: string;

  @IsUUID()
  requestId!: string;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  answers!: string[];

  @IsBoolean()
  completed!: boolean;
}
