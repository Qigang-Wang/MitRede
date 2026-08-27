import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import type { UpdateSettingsDto } from "./dto/update-settings.dto";

const demoEmail = "demo@mitrede.local";

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async owner() {
    return this.prisma.user.upsert({
      where: { email: demoEmail },
      update: {},
      create: { email: demoEmail, displayName: "Sabine Wolf" },
    });
  }

  async get() {
    const owner = await this.owner();
    return { publicBaseUrl: owner.publicBaseUrl ?? "" };
  }

  async update(body: UpdateSettingsDto) {
    const owner = await this.owner();
    const input = body.publicBaseUrl.trim();
    let publicBaseUrl = "";
    if (input) {
      try {
        const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
        if (url.username || url.password) throw new Error();
        publicBaseUrl = url.origin;
      } catch {
        throw new BadRequestException("Bitte geben Sie eine gültige Domain ein");
      }
    }
    const updated = await this.prisma.user.update({ where: { id: owner.id }, data: { publicBaseUrl } });
    return { publicBaseUrl: updated.publicBaseUrl ?? "" };
  }
}
