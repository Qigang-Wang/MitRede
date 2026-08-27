import { IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class CreateGroupDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  participantToken!: string;

  @IsString()
  nodeId!: string;

  @IsUUID()
  requestId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;
}
