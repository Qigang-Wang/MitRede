import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from "class-validator";

export class SubmitAnswerDto {
  @IsString()
  @MinLength(16)
  participantToken!: string;

  @IsString()
  nodeId!: string;

  @IsUUID()
  requestId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  optionIndex?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(100, { each: true })
  scaleValues?: number[];
}
