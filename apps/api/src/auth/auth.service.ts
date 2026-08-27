import { Injectable, Logger, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { PrismaService } from "../database/prisma.service";
import type { AuthUser } from "./auth.types";

const scrypt = promisify(scryptCallback);
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const email = this.adminEmail();
    const configuredPassword = this.config.get<string>("ADMIN_PASSWORD")?.trim();
    const production = this.config.get<string>("NODE_ENV") === "production";
    if (production && !configuredPassword) {
      throw new Error("ADMIN_PASSWORD muss in der Produktionsumgebung gesetzt sein");
    }
    const password = configuredPassword || "MitRede123!";
    const existing = await this.prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, displayName: "Sabine Wolf", role: "ADMIN" },
      select: { id: true, passwordHash: true },
    });
    const passwordNeedsUpdate = !existing.passwordHash
      || Boolean(configuredPassword && !(await this.verifyPassword(configuredPassword, existing.passwordHash)));
    if (passwordNeedsUpdate) {
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: existing.id },
          data: { passwordHash: await this.hashPassword(password), role: "ADMIN" },
        }),
        this.prisma.authSession.deleteMany({ where: { userId: existing.id } }),
      ]);
    }
    if (!configuredPassword) {
      this.logger.warn("Lokales Entwicklungskonto verwendet das Standardpasswort; ADMIN_PASSWORD vor Produktion setzen");
    }
  }

  async login(emailInput: string, password: string) {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = user?.passwordHash ? await this.verifyPassword(password, user.passwordHash) : false;
    if (!user || !valid) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      throw new UnauthorizedException("E-Mail-Adresse oder Passwort ist falsch");
    }

    await this.prisma.authSession.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    const token = randomBytes(32).toString("base64url");
    await this.prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: this.tokenHash(token),
        expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
      },
    });
    return { token, user: this.publicUser(user) };
  }

  async authenticate(token: string | undefined): Promise<AuthUser> {
    if (!token) throw new UnauthorizedException("Anmeldung erforderlich");
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: this.tokenHash(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt <= new Date()) {
      if (session) await this.prisma.authSession.delete({ where: { id: session.id } });
      throw new UnauthorizedException("Die Anmeldung ist abgelaufen");
    }
    if (Date.now() - session.lastSeenAt.getTime() > 60 * 60 * 1000) {
      void this.prisma.authSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    }
    return this.publicUser(session.user);
  }

  async logout(token: string | undefined) {
    if (token) await this.prisma.authSession.deleteMany({ where: { tokenHash: this.tokenHash(token) } });
  }

  sessionCookie(token: string) {
    return `${this.cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_LIFETIME_MS / 1000)}${this.secureCookie() ? "; Secure" : ""}`;
  }

  clearSessionCookie() {
    return `${this.cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${this.secureCookie() ? "; Secure" : ""}`;
  }

  tokenFromCookie(cookieHeader: string | undefined) {
    if (!cookieHeader) return undefined;
    for (const part of cookieHeader.split(";")) {
      const [name, ...value] = part.trim().split("=");
      if (name === this.cookieName) return value.join("=");
    }
    return undefined;
  }

  private get cookieName() {
    return this.secureCookie() ? "__Host-mitrede_session" : "mitrede_session";
  }

  private adminEmail() {
    return (this.config.get<string>("ADMIN_EMAIL") || "demo@mitrede.local").trim().toLowerCase();
  }

  private secureCookie() {
    const override = this.config.get<string>("COOKIE_SECURE");
    return override === "true" || (override !== "false" && this.config.get<string>("NODE_ENV") === "production");
  }

  private async hashPassword(password: string) {
    const salt = randomBytes(16);
    const derived = await scrypt(password, salt, 64) as Buffer;
    return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
  }

  private async verifyPassword(password: string, encoded: string) {
    const [algorithm, saltValue, hashValue] = encoded.split("$");
    if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
    const expected = Buffer.from(hashValue, "base64url");
    const derived = await scrypt(password, Buffer.from(saltValue, "base64url"), expected.length) as Buffer;
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  }

  private tokenHash(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private publicUser(user: { id: string; email: string; displayName: string; role: "USER" | "ADMIN" }): AuthUser {
    return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
  }
}
