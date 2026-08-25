import { IsInt, IsString, IsUUID, Max, Min, MinLength } from "class-validator";

export class SubmitAnswerDto {
  @IsString()
  @MinLength(16)
  participantToken!: string;

  @IsString()
  nodeId!: string;

  @IsUUID()
  requestId!: string;

  @IsInt()
  @Min(0)
  @Max(20)
  optionIndex!: number;
}

