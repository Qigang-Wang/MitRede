import { Body, Controller, Get, Post, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "./auth.guard";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { Public } from "./public.decorator";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  @ApiOperation({ summary: "Meldet ein lokales Benutzerkonto an" })
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(body.email, body.password);
    response.setHeader("Set-Cookie", this.auth.sessionCookie(result.token));
    response.setHeader("Cache-Control", "no-store");
    return { user: result.user };
  }

  @Get("me")
  @ApiOperation({ summary: "Lädt das aktuell angemeldete Benutzerkonto" })
  me(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    response.setHeader("Cache-Control", "no-store");
    return { user: request.authUser };
  }

  @Post("logout")
  @ApiOperation({ summary: "Beendet die aktuelle Anmeldung" })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(this.auth.tokenFromCookie(request.headers.cookie));
    response.setHeader("Set-Cookie", this.auth.clearSessionCookie());
    response.setHeader("Cache-Control", "no-store");
    return { loggedOut: true };
  }
}
