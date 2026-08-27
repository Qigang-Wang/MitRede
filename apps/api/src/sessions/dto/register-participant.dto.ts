import { IsString, MaxLength, MinLength } from "class-validator";

export class RegisterParticipantDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  participantToken!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  displayName!: string;
}
