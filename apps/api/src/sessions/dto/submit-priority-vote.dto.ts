import { ArrayMaxSize, ArrayUnique, IsArray, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class SubmitPriorityVoteDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  participantToken!: string;

  @IsString()
  nodeId!: string;

  @IsUUID()
  requestId!: string;

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  pointIds!: string[];
}
