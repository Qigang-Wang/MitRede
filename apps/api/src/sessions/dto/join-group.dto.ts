import { IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class JoinGroupDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  participantToken!: string;

  @IsString()
  nodeId!: string;

  @IsUUID()
  requestId!: string;
}
