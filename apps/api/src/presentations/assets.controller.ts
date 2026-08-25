import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import type { Response } from "express";

@Controller("assets/pdfs")
export class AssetsController {
  @Get(":objectKey")
  async pdf(@Param("objectKey") objectKey: string, @Res({ passthrough: true }) response: Response) {
    if (!/^[a-f0-9-]{36}\.pdf$/i.test(objectKey)) {
      throw new NotFoundException("PDF nicht gefunden");
    }
    const storageRoot = resolve(process.env.STORAGE_PATH ?? "../../storage");
    const filePath = resolve(storageRoot, "pdfs", objectKey);
    try {
      await access(filePath);
    } catch {
      throw new NotFoundException("PDF nicht gefunden");
    }
    response.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${objectKey}"`,
      "Cache-Control": "private, max-age=3600",
    });
    return new StreamableFile(createReadStream(filePath));
  }
}

