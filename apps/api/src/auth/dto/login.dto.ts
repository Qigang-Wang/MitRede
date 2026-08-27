import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail({}, { message: "Bitte geben Sie eine gültige E-Mail-Adresse ein" })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8, { message: "Das Passwort muss mindestens 8 Zeichen lang sein" })
  @MaxLength(200)
  password!: string;
}
