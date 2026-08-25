import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { NodeType, Prisma } from "@prisma/client";
import { PDFDocument } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../database/prisma.service";
import type { CreatePollDto } from "./dto/create-poll.dto";

const demoEmail = "demo@mitrede.local";

@Injectable()
export class PresentationsService {
  constructor(private readonly prisma: PrismaService) {}

  private async owner() {
    return this.prisma.user.upsert({
      where: { email: demoEmail },
      update: {},
      create: { email: demoEmail, displayName: "Sabine Wolf" },
    });
  }

  private async ensureSample() {
    const owner = await this.owner();
    const existing = await this.prisma.presentation.findFirst({
      where: { ownerId: owner.id },
    });
    if (existing) return;

    await this.prisma.presentation.create({
      data: {
        ownerId: owner.id,
        title: "KI in der Forschung",
        status: "ACTIVE",
        nodes: {
          create: {
            position: 0,
            type: "MULTIPLE_CHOICE",
            config: {
              question: "Wo sehen Sie das größte Potenzial von KI in Ihrer Arbeit?",
              options: [
                "Datenanalyse",
                "Literaturrecherche",
                "Texterstellung",
                "Projektorganisation",
              ],
              maxSelections: 1,
              resultDisplayMode: "MANUAL",
            },
          },
        },
      },
    });
  }

  async list() {
    await this.ensureSample();
    const items = await this.prisma.presentation.findMany({
      orderBy: { updatedAt: "desc" },
      include: { nodes: { select: { type: true } } },
    });

    return items.map(({ nodes, ...presentation }) => ({
      ...presentation,
      pageCount: nodes.filter((node) => node.type === "PDF_PAGE").length,
      interactionCount: nodes.filter((node) => node.type !== "PDF_PAGE").length,
    }));
  }

  async get(id: string) {
    const presentation = await this.prisma.presentation.findUnique({
      where: { id },
      include: { nodes: { orderBy: { position: "asc" } } },
    });
    if (!presentation) throw new NotFoundException("Präsentation nicht gefunden");
    return presentation;
  }

  async createFromPdf(title: string, file: Express.Multer.File) {
    if (file.mimetype !== "application/pdf" && !file.originalname.toLowerCase().endsWith(".pdf")) {
      throw new BadRequestException("Nur PDF-Dateien werden unterstützt");
    }
    if (file.buffer.subarray(0, 5).toString() !== "%PDF-") {
      throw new BadRequestException("Die Datei ist keine gültige PDF-Datei");
    }

    let pageCount: number;
    try {
      const pdf = await PDFDocument.load(file.buffer);
      pageCount = pdf.getPageCount();
    } catch {
      throw new BadRequestException("Die PDF-Datei konnte nicht gelesen werden");
    }

    const storageRoot = resolve(process.env.STORAGE_PATH ?? "../../storage");
    const pdfDirectory = resolve(storageRoot, "pdfs");
    await mkdir(pdfDirectory, { recursive: true });
    const objectKey = `${randomUUID()}.pdf`;
    await writeFile(resolve(pdfDirectory, objectKey), file.buffer, { flag: "wx" });

    const owner = await this.owner();
    const nodes: Prisma.PresentationNodeCreateWithoutPresentationInput[] = Array.from(
      { length: pageCount },
      (_, index) => ({
        position: index,
        type: NodeType.PDF_PAGE,
        sourcePageNumber: index + 1,
        config: {
          objectKey,
          originalName: file.originalname,
          pageNumber: index + 1,
        },
      }),
    );
    nodes.push({
      position: pageCount,
      type: NodeType.MULTIPLE_CHOICE,
      config: {
        question: "Was ist Ihre wichtigste Erkenntnis aus dieser Präsentation?",
        options: ["Neue Perspektive", "Konkrete Idee", "Offene Frage"],
        maxSelections: 1,
        resultDisplayMode: "MANUAL",
      },
    });

    return this.prisma.presentation.create({
      data: {
        ownerId: owner.id,
        title: title.trim(),
        status: "ACTIVE",
        nodes: { create: nodes },
      },
      include: { nodes: { orderBy: { position: "asc" } } },
    });
  }

  async addPoll(id: string, body: CreatePollDto) {
    await this.get(id);
    const aggregate = await this.prisma.presentationNode.aggregate({
      where: { presentationId: id },
      _max: { position: true },
    });
    const node = await this.prisma.$transaction(async (tx) => {
      const created = await tx.presentationNode.create({
        data: {
          presentationId: id,
          position: (aggregate._max.position ?? -1) + 1,
          type: "MULTIPLE_CHOICE",
          config: {
            question: body.question.trim(),
            options: body.options.map((option) => option.trim()),
            maxSelections: 1,
            resultDisplayMode: body.resultDisplayMode ?? "MANUAL",
          },
        },
      });
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
      return created;
    });
    return node;
  }

  async updatePoll(id: string, nodeId: string, body: CreatePollDto) {
    const node = await this.prisma.presentationNode.findFirst({
      where: { id: nodeId, presentationId: id },
    });
    if (!node) throw new NotFoundException("Interaktionsseite nicht gefunden");
    if (node.type !== "MULTIPLE_CHOICE") {
      throw new BadRequestException("PDF-Seiten können nicht als Frage bearbeitet werden");
    }
    const existingConfig = node.config as { resultDisplayMode?: "MANUAL" | "LIVE" };
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.presentationNode.update({
        where: { id: nodeId },
        data: {
          config: {
            question: body.question.trim(),
            options: body.options.map((option) => option.trim()),
            maxSelections: 1,
            resultDisplayMode: body.resultDisplayMode ?? existingConfig.resultDisplayMode ?? "MANUAL",
          },
        },
      });
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
      return updated;
    });
  }

  async duplicate(id: string, nodeId: string) {
    const node = await this.prisma.presentationNode.findFirst({
      where: { id: nodeId, presentationId: id },
    });
    if (!node) throw new NotFoundException("Interaktionsseite nicht gefunden");
    if (node.type === "PDF_PAGE") {
      throw new BadRequestException("PDF-Seiten können nicht dupliziert werden");
    }
    const aggregate = await this.prisma.presentationNode.aggregate({
      where: { presentationId: id },
      _max: { position: true },
    });
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.presentationNode.create({
        data: {
          presentationId: id,
          position: (aggregate._max.position ?? -1) + 1,
          type: node.type,
          config: node.config as Prisma.InputJsonValue,
        },
      });
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
      return created;
    });
  }

  async remove(id: string, nodeId: string) {
    const node = await this.prisma.presentationNode.findFirst({
      where: { id: nodeId, presentationId: id },
    });
    if (!node) throw new NotFoundException("Interaktionsseite nicht gefunden");
    if (node.type === "PDF_PAGE") {
      throw new BadRequestException("PDF-Seiten bleiben in der ersten Version erhalten");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.presentationNode.delete({ where: { id: nodeId } });
      const remaining = await tx.presentationNode.findMany({
        where: { presentationId: id },
        orderBy: { position: "asc" },
      });
      for (let index = 0; index < remaining.length; index += 1) {
        await tx.presentationNode.update({ where: { id: remaining[index]!.id }, data: { position: -(index + 1) } });
      }
      for (let index = 0; index < remaining.length; index += 1) {
        await tx.presentationNode.update({ where: { id: remaining[index]!.id }, data: { position: index } });
      }
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
    });
    return { deleted: true };
  }

  async reorder(id: string, nodeIds: string[]) {
    const nodes = await this.prisma.presentationNode.findMany({
      where: { presentationId: id },
      orderBy: { position: "asc" },
    });
    if (nodes.length !== nodeIds.length || new Set(nodeIds).size !== nodes.length) {
      throw new BadRequestException("Die Knotenliste ist unvollständig");
    }
    const byId = new Map(nodes.map((node) => [node.id, node]));
    if (nodeIds.some((nodeId) => !byId.has(nodeId))) {
      throw new BadRequestException("Die Knotenliste enthält fremde Einträge");
    }
    const previousPdfOrder = nodes.filter((node) => node.type === "PDF_PAGE").map((node) => node.id);
    const nextPdfOrder = nodeIds.filter((nodeId) => byId.get(nodeId)?.type === "PDF_PAGE");
    if (previousPdfOrder.some((nodeId, index) => nextPdfOrder[index] !== nodeId)) {
      throw new BadRequestException("Die Reihenfolge der PDF-Seiten darf nicht verändert werden");
    }

    await this.prisma.$transaction(async (tx) => {
      for (let index = 0; index < nodeIds.length; index += 1) {
        await tx.presentationNode.update({ where: { id: nodeIds[index]! }, data: { position: -(index + 1) } });
      }
      for (let index = 0; index < nodeIds.length; index += 1) {
        await tx.presentationNode.update({ where: { id: nodeIds[index]! }, data: { position: index } });
      }
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
    });
    return this.get(id);
  }
}
