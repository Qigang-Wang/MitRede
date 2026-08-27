import { IsInt, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class UpdateGroupPageDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  question!: string;

  @IsString()
  @MaxLength(1000)
  prompt!: string;

  @IsString()
  @MaxLength(300)
  resultPrompt!: string;

  @IsInt()
  @Min(2)
  @Max(20)
  maxGroups!: number;
}
