import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { NodeType, Prisma } from "@prisma/client";
import type { PresentationExport } from "@mitrede/contracts";
import { PDFDocument } from "pdf-lib";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../database/prisma.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import type { CreatePollDto } from "./dto/create-poll.dto";
import type { CreateRatingDto } from "./dto/create-rating.dto";
import type { CreateContentPageDto } from "./dto/create-content-page.dto";
import type { UpdateFreeformPageDto } from "./dto/update-freeform-page.dto";
import type { UpdateGroupPageDto } from "./dto/update-group-page.dto";
import type { UpdateGroupDiscussionDto } from "./dto/update-group-discussion.dto";
import type { UpdateGroupPresentationDto } from "./dto/update-group-presentation.dto";
import type { UpdatePriorityVoteDto } from "./dto/update-priority-vote.dto";
import type { UpdateWebPageDto } from "./dto/update-web-page.dto";

const demoEmail = "demo@mitrede.local";

@Injectable()
export class PresentationsService {
  constructor(private readonly prisma: PrismaService, private readonly realtime: RealtimeGateway) {}

  private async owner() {
    return this.prisma.user.upsert({
      where: { email: demoEmail },
      update: {},
      create: { email: demoEmail, displayName: "Sabine Wolf" },
    });
  }

  async list() {
    const items = await this.prisma.presentation.findMany({
      orderBy: { updatedAt: "desc" },
      include: { nodes: { select: { type: true } } },
    });

    return items.map(({ nodes, ...presentation }) => ({
      ...presentation,
      nodeCount: nodes.length,
      pageCount: nodes.filter((node) => node.type === "PDF_PAGE").length,
      interactionCount: nodes.filter((node) => node.type === "MULTIPLE_CHOICE" || node.type === "RATING" || node.type === "GROUP_PAGE" || node.type === "GROUP_DISCUSSION" || node.type === "GROUP_PRESENTATION" || node.type === "PRIORITY_VOTE").length,
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

  async removePresentation(id: string) {
    const presentation = await this.prisma.presentation.findUnique({
      where: { id },
      select: { sessions: { select: { id: true, stateVersion: true } } },
    });
    if (!presentation) throw new NotFoundException("Präsentation nicht gefunden");
    await this.prisma.$transaction([
      this.prisma.liveSession.deleteMany({ where: { presentationId: id } }),
      this.prisma.presentation.delete({ where: { id } }),
    ]);
    for (const session of presentation.sessions) {
      this.realtime.emitSessionEvent(session.id, {
        eventId: randomUUID(),
        sessionId: session.id,
        stateVersion: session.stateVersion + 1,
        occurredAt: new Date().toISOString(),
        type: "session.deleted",
        payload: {},
      });
    }
    return { removed: true, sessionIds: presentation.sessions.map((session) => session.id) };
  }

  async createBlank(title: string) {
    const owner = await this.owner();
    return this.prisma.presentation.create({
      data: {
        ownerId: owner.id,
        title: title.trim(),
        status: "ACTIVE",
      },
      include: { nodes: { orderBy: { position: "asc" } } },
    });
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

  async exportPresentation(id: string) {
    const presentation = await this.get(id);
    const assetReferences = new Map<string, "PDF" | "IMAGE">();
    const nodes = presentation.nodes.map((node) => {
      if (!this.isRecord(node.config)) {
        throw new BadRequestException("Die Präsentation enthält eine ungültige Seitenkonfiguration");
      }
      this.collectAssetReferences(node.type, node.config, assetReferences);
      return {
        sourceId: node.id,
        position: node.position,
        type: node.type,
        sourcePageNumber: node.sourcePageNumber,
        config: node.config,
      };
    });

    const storageRoot = resolve(process.env.STORAGE_PATH ?? "../../storage");
    const assets: PresentationExport["assets"] = [];
    for (const [objectKey, kind] of assetReferences) {
      const filePath = resolve(storageRoot, kind === "PDF" ? "pdfs" : "images", objectKey);
      let data: Buffer;
      try {
        data = await readFile(filePath);
      } catch {
        throw new BadRequestException(`Die Mediendatei ${objectKey} fehlt und kann nicht exportiert werden`);
      }
      assets.push({
        objectKey,
        kind,
        mimeType: this.assetMimeType(objectKey, kind),
        dataBase64: data.toString("base64"),
      });
    }

    const payload: PresentationExport = {
      format: "mitrede.presentation",
      version: 1,
      exportedAt: new Date().toISOString(),
      presentation: { title: presentation.title, nodes },
      assets,
    };
    return {
      title: presentation.title,
      contents: Buffer.from(JSON.stringify(payload, null, 2)),
    };
  }

  async importPresentation(file: Express.Multer.File) {
    if (!file.originalname.toLowerCase().endsWith(".json")) {
      throw new BadRequestException("Bitte wählen Sie eine MitRede-JSON-Datei aus");
    }
    const payload = this.parsePresentationExport(file.buffer);
    const preparedAssets = this.prepareImportedAssets(payload);
    const storageRoot = resolve(process.env.STORAGE_PATH ?? "../../storage");
    const writtenPaths: string[] = [];

    try {
      for (const asset of preparedAssets.values()) {
        const directory = resolve(storageRoot, asset.kind === "PDF" ? "pdfs" : "images");
        await mkdir(directory, { recursive: true });
        const filePath = resolve(directory, asset.newObjectKey);
        await writeFile(filePath, asset.data, { flag: "wx" });
        writtenPaths.push(filePath);
      }

      const owner = await this.owner();
      const nodeIds = new Map(payload.presentation.nodes.map((node) => [node.sourceId, randomUUID()]));
      const imported = await this.prisma.$transaction(async (tx) => {
        const presentation = await tx.presentation.create({
          data: {
            ownerId: owner.id,
            title: payload.presentation.title,
            status: "ACTIVE",
          },
        });
        for (const node of [...payload.presentation.nodes].sort((left, right) => left.position - right.position)) {
          await tx.presentationNode.create({
            data: {
              id: nodeIds.get(node.sourceId),
              presentationId: presentation.id,
              position: node.position,
              type: node.type,
              sourcePageNumber: node.sourcePageNumber,
              config: this.remapImportedConfig(node.type, node.config, preparedAssets, nodeIds) as Prisma.InputJsonValue,
            },
          });
        }
        return presentation;
      });
      return this.get(imported.id);
    } catch (error) {
      await Promise.all(writtenPaths.map((filePath) => unlink(filePath).catch(() => undefined)));
      throw error;
    }
  }

  private collectAssetReferences(type: NodeType, config: Record<string, unknown>, references: Map<string, "PDF" | "IMAGE">) {
    if (type === NodeType.PDF_PAGE) {
      const objectKey = config.objectKey;
      if (typeof objectKey !== "string" || !/^[a-f0-9-]{36}\.pdf$/i.test(objectKey)) {
        throw new BadRequestException("Eine PDF-Seite enthält einen ungültigen Dateiverweis");
      }
      references.set(objectKey, "PDF");
    }
    if (type === NodeType.FREEFORM_PAGE && Array.isArray(config.elements)) {
      for (const element of config.elements) {
        if (!this.isRecord(element) || element.type !== "IMAGE") continue;
        const objectKey = element.objectKey;
        if (typeof objectKey !== "string" || !/^[a-f0-9-]{36}\.(png|jpg|webp)$/i.test(objectKey)) {
          throw new BadRequestException("Eine freie Seite enthält einen ungültigen Bildverweis");
        }
        references.set(objectKey, "IMAGE");
      }
    }
  }

  private assetMimeType(objectKey: string, kind: "PDF" | "IMAGE"): PresentationExport["assets"][number]["mimeType"] {
    if (kind === "PDF") return "application/pdf";
    if (objectKey.toLowerCase().endsWith(".png")) return "image/png";
    if (objectKey.toLowerCase().endsWith(".webp")) return "image/webp";
    return "image/jpeg";
  }

  private parsePresentationExport(buffer: Buffer): PresentationExport {
    let value: unknown;
    try {
      value = JSON.parse(buffer.toString("utf8"));
    } catch {
      throw new BadRequestException("Die Importdatei enthält kein gültiges JSON");
    }
    if (!this.isRecord(value) || value.format !== "mitrede.presentation" || value.version !== 1) {
      throw new BadRequestException("Dieses Exportformat wird nicht unterstützt");
    }
    if (typeof value.exportedAt !== "string" || Number.isNaN(Date.parse(value.exportedAt))) {
      throw new BadRequestException("Der Exportzeitpunkt ist ungültig");
    }
    if (!this.isRecord(value.presentation) || typeof value.presentation.title !== "string") {
      throw new BadRequestException("Die Präsentationsdaten fehlen");
    }
    const title = value.presentation.title.trim();
    if (!title || title.length > 200 || !Array.isArray(value.presentation.nodes) || value.presentation.nodes.length > 2000) {
      throw new BadRequestException("Titel oder Seitenliste ist ungültig");
    }
    if (!Array.isArray(value.assets) || value.assets.length > 2000) {
      throw new BadRequestException("Die Medienliste ist ungültig");
    }

    const nodeTypes = new Set<string>(Object.values(NodeType));
    const sourceIds = new Set<string>();
    const positions = new Set<number>();
    for (const node of value.presentation.nodes) {
      if (!this.isRecord(node)
        || typeof node.sourceId !== "string" || !node.sourceId || node.sourceId.length > 100
        || typeof node.position !== "number" || !Number.isInteger(node.position) || node.position < 0
        || typeof node.type !== "string" || !nodeTypes.has(node.type)
        || (node.sourcePageNumber !== null && (typeof node.sourcePageNumber !== "number" || !Number.isInteger(node.sourcePageNumber) || node.sourcePageNumber < 1))
        || !this.isRecord(node.config)
        || sourceIds.has(node.sourceId) || positions.has(node.position)) {
        throw new BadRequestException("Mindestens eine importierte Seite ist ungültig");
      }
      sourceIds.add(node.sourceId);
      positions.add(node.position);
    }
    if ([...positions].some((position) => position >= positions.size)) {
      throw new BadRequestException("Die Seitenreihenfolge ist unvollständig");
    }

    const assetKeys = new Set<string>();
    for (const asset of value.assets) {
      if (!this.isRecord(asset)
        || typeof asset.objectKey !== "string" || !asset.objectKey || asset.objectKey.length > 100
        || (asset.kind !== "PDF" && asset.kind !== "IMAGE")
        || !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(String(asset.mimeType))
        || typeof asset.dataBase64 !== "string" || !asset.dataBase64
        || assetKeys.has(asset.objectKey)) {
        throw new BadRequestException("Mindestens eine importierte Mediendatei ist ungültig");
      }
      assetKeys.add(asset.objectKey);
    }
    return {
      format: "mitrede.presentation",
      version: 1,
      exportedAt: value.exportedAt,
      presentation: {
        title,
        nodes: value.presentation.nodes as PresentationExport["presentation"]["nodes"],
      },
      assets: value.assets as PresentationExport["assets"],
    };
  }

  private prepareImportedAssets(payload: PresentationExport) {
    const prepared = new Map<string, { kind: "PDF" | "IMAGE"; newObjectKey: string; data: Buffer }>();
    let totalSize = 0;
    for (const asset of payload.assets) {
      if (asset.dataBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(asset.dataBase64)) {
        throw new BadRequestException(`Die Mediendatei ${asset.objectKey} ist beschädigt`);
      }
      const data = Buffer.from(asset.dataBase64, "base64");
      const maximumSize = asset.kind === "PDF" ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
      totalSize += data.length;
      if (!data.length || data.length > maximumSize || totalSize > 180 * 1024 * 1024) {
        throw new BadRequestException("Die importierten Mediendateien sind zu groß");
      }
      const extension = this.validateImportedAsset(asset.kind, asset.mimeType, data);
      prepared.set(asset.objectKey, { kind: asset.kind, newObjectKey: `${randomUUID()}.${extension}`, data });
    }
    return prepared;
  }

  private validateImportedAsset(kind: "PDF" | "IMAGE", mimeType: string, data: Buffer) {
    if (kind === "PDF" && mimeType === "application/pdf" && data.subarray(0, 5).toString() === "%PDF-") return "pdf";
    const png = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    const webp = data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP";
    if (kind === "IMAGE" && ((mimeType === "image/png" && png) || (mimeType === "image/jpeg" && jpeg) || (mimeType === "image/webp" && webp))) {
      return mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    }
    throw new BadRequestException("Eine importierte Mediendatei hat ein ungültiges Format");
  }

  private remapImportedConfig(
    type: NodeType,
    config: Record<string, unknown>,
    assets: Map<string, { kind: "PDF" | "IMAGE"; newObjectKey: string; data: Buffer }>,
    nodeIds: Map<string, string>,
  ) {
    const remapped = structuredClone(config);
    if (type === NodeType.PDF_PAGE) {
      const originalKey = remapped.objectKey;
      const asset = typeof originalKey === "string" ? assets.get(originalKey) : undefined;
      if (!asset || asset.kind !== "PDF") throw new BadRequestException("Eine referenzierte PDF-Datei fehlt im Import");
      remapped.objectKey = asset.newObjectKey;
    }
    if (type === NodeType.FREEFORM_PAGE && Array.isArray(remapped.elements)) {
      for (const element of remapped.elements) {
        if (!this.isRecord(element) || element.type !== "IMAGE") continue;
        const asset = typeof element.objectKey === "string" ? assets.get(element.objectKey) : undefined;
        if (!asset || asset.kind !== "IMAGE") throw new BadRequestException("Ein referenziertes Bild fehlt im Import");
        element.objectKey = asset.newObjectKey;
      }
    }
    if (typeof remapped.sourceGroupNodeId === "string") {
      const mappedNodeId = nodeIds.get(remapped.sourceGroupNodeId);
      if (!mappedNodeId) throw new BadRequestException("Eine verknüpfte Gruppenseite fehlt im Import");
      remapped.sourceGroupNodeId = mappedNodeId;
    }
    return remapped;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  async addPoll(id: string, body: CreatePollDto) {
    await this.get(id);
    this.validateQuiz(body);
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
            resultDisplayMode: body.assessmentMode === "QUIZ" ? "MANUAL" : body.resultDisplayMode ?? "MANUAL",
            assessmentMode: body.assessmentMode ?? "FEEDBACK",
            ...(body.assessmentMode === "QUIZ" ? { correctOptionIndex: body.correctOptionIndex ?? 0 } : {}),
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
    this.validateQuiz(body);
    const existingConfig = node.config as { resultDisplayMode?: "MANUAL" | "LIVE" };
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.presentationNode.update({
        where: { id: nodeId },
        data: {
          config: {
            question: body.question.trim(),
            options: body.options.map((option) => option.trim()),
            maxSelections: 1,
            resultDisplayMode: body.assessmentMode === "QUIZ" ? "MANUAL" : body.resultDisplayMode ?? existingConfig.resultDisplayMode ?? "MANUAL",
            assessmentMode: body.assessmentMode ?? "FEEDBACK",
            ...(body.assessmentMode === "QUIZ" ? { correctOptionIndex: body.correctOptionIndex ?? 0 } : {}),
          },
        },
      });
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
      return updated;
    });
  }

  private validateQuiz(body: CreatePollDto) {
    if (body.assessmentMode === "QUIZ" && (body.correctOptionIndex === undefined || body.correctOptionIndex >= body.options.length)) {
      throw new BadRequestException("Für ein Quiz muss eine gültige richtige Antwort gewählt werden");
    }
  }

  async addRating(id: string, body: CreateRatingDto) {
    await this.get(id);
    this.validateRatingRange(body.min, body.max);
    const aggregate = await this.prisma.presentationNode.aggregate({
      where: { presentationId: id },
      _max: { position: true },
    });
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.presentationNode.create({
        data: {
          presentationId: id,
          position: (aggregate._max.position ?? -1) + 1,
          type: "RATING",
          config: this.ratingConfig(body),
        },
      });
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
      return created;
    });
  }

  async addJoinPage(id: string) {
    await this.get(id);
    const aggregate = await this.prisma.presentationNode.aggregate({
      where: { presentationId: id },
      _max: { position: true },
    });
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.presentationNode.create({
        data: {
          presentationId: id,
          position: (aggregate._max.position ?? -1) + 1,
          type: "JOIN_PAGE",
          config: { title: "Jetzt teilnehmen" },
        },
      });
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
      return created;
    });
  }

  async addContentPage(id: string) {
    await this.get(id);
    const aggregate = await this.prisma.presentationNode.aggregate({
      where: { presentationId: id },
      _max: { position: true },
    });
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.presentationNode.create({
        data: {
          presentationId: id,
          position: (aggregate._max.position ?? -1) + 1,
          type: "CONTENT_PAGE",
          config: {
            eyebrow: "",
            title: "Neue Informationsseite",
            body: "Ergänzen Sie hier Ihre Inhalte.",
          },
        },
      });
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
      return created;
    });
  }

  async updateContentPage(id: string, nodeId: string, body: CreateContentPageDto) {
    const node = await this.prisma.presentationNode.findFirst({
      where: { id: nodeId, presentationId: id },
    });
    if (!node) throw new NotFoundException("Informationsseite nicht gefunden");
    if (node.type !== "CONTENT_PAGE") {
      throw new BadRequestException("Diese Seite ist keine Informationsseite");
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.presentationNode.update({
        where: { id: nodeId },
        data: {
          config: {
            eyebrow: body.eyebrow?.trim() ?? "",
            title: body.title.trim(),
            body: body.body.trim(),
          },
        },
      });
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
      return updated;
    });
  }

  async addWebPage(id: string) {
    await this.get(id);
    const aggregate = await this.prisma.presentationNode.aggregate({
      where: { presentationId: id },
      _max: { position: true },
    });
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.presentationNode.create({
        data: {
          presentationId: id,
          position: (aggregate._max.position ?? -1) + 1,
          type: "WEB_PAGE",
          config: {
            title: "Neue Webseite",
            url: "https://example.com",
            interactive: true,
          },
        },
      });
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
      return created;
    });
  }

  async updateWebPage(id: string, nodeId: string, body: UpdateWebPageDto) {
    const node = await this.prisma.presentationNode.findFirst({ where: { id: nodeId, presentationId: id } });
    if (!node) throw new NotFoundException("Webseite nicht gefunden");
    if (node.type !== "WEB_PAGE") throw new BadRequestException("Diese Seite ist keine Webseite");
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.presentationNode.update({
        where: { id: nodeId },
        data: {
          config: {
            title: body.title.trim(),
            url: body.url.trim(),
            interactive: body.interactive ?? true,
          },
        },
      });
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
      return updated;
    });
  }

  async addFreeformPage(id: string, template: "BLANK" | "TITLE_BODY" = "BLANK") {
    await this.get(id);
    const aggregate = await this.prisma.presentationNode.aggregate({
      where: { presentationId: id },
      _max: { position: true },
    });
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.presentationNode.create({
        data: {
          presentationId: id,
          position: (aggregate._max.position ?? -1) + 1,
          type: "FREEFORM_PAGE",
          config: {
            backgroundColor: "#fffaf1",
            elements: template === "TITLE_BODY" ? [
              {
                id: randomUUID(),
                type: "TEXT",
                x: 100,
                y: 80,
                width: 1280,
                height: 135,
                text: "Titel hinzufügen",
                fontSize: 64,
                color: "#19332e",
                fontWeight: 700,
                fontStyle: "normal",
                textAlign: "left",
                listStyle: "none",
              },
              {
                id: randomUUID(),
                type: "TEXT",
                x: 100,
                y: 250,
                width: 1120,
                height: 300,
                text: "Fügen Sie hier Ihre Inhalte hinzu.",
                fontSize: 42,
                color: "#5f665f",
                fontWeight: 400,
                fontStyle: "normal",
                textAlign: "left",
                listStyle: "none",
              },
            ] : [],
          },
        },
      });
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
      return created;
    });
  }

  async updateFreeformPage(id: string, nodeId: string, body: UpdateFreeformPageDto) {
    const node = await this.prisma.presentationNode.findFirst({
      where: { id: nodeId, presentationId: id },
    });
    if (!node) throw new NotFoundException("Freie Seite nicht gefunden");
    if (node.type !== "FREEFORM_PAGE") {
      throw new BadRequestException("Diese Seite ist keine freie Seite");
    }
    const config = this.normalizeFreeformConfig(body);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.presentationNode.update({
        where: { id: nodeId },
        data: { config },
      });
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
      return updated;
    });
  }

  async addGroupPage(id: string) {
    await this.get(id);
    const aggregate = await this.prisma.presentationNode.aggregate({
      where: { presentationId: id },
      _max: { position: true },
    });
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.presentationNode.create({
        data: {
          presentationId: id,
          position: (aggregate._max.position ?? -1) + 1,
          type: "GROUP_PAGE",
          config: {
            question: "Finden Sie Ihre Gruppe",
            prompt: "Erstellen Sie eine Gruppe oder treten Sie einer bestehenden Gruppe bei.",
            resultPrompt: "",
            maxGroups: 8,
          },
        },
      });
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
      return created;
    });
  }

  async updateGroupPage(id: string, nodeId: string, body: UpdateGroupPageDto) {
    const node = await this.prisma.presentationNode.findFirst({ where: { id: nodeId, presentationId: id } });
    if (!node) throw new NotFoundException("Gruppenseite nicht gefunden");
    if (node.type !== "GROUP_PAGE") throw new BadRequestException("Diese Seite ist keine Gruppenseite");
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.presentationNode.update({
        where: { id: nodeId },
        data: {
          config: {
            question: body.question.trim(),
            prompt: body.prompt.trim(),
            resultPrompt: body.resultPrompt.trim(),
            maxGroups: body.maxGroups,
          },
        },
      });
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
      return updated;
    });
  }

  async addGroupDiscussion(id: string) {
    const presentation = await this.get(id);
    const aggregate = await this.prisma.presentationNode.aggregate({ where: { presentationId: id }, _max: { position: true } });
    const source = [...presentation.nodes].reverse().find((node) => node.type === "GROUP_PAGE");
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.presentationNode.create({
        data: {
          presentationId: id,
          position: (aggregate._max.position ?? -1) + 1,
          type: "GROUP_DISCUSSION",
          config: {
            question: "Diskutieren Sie in Ihren Gruppen",
            prompt: "",
            resultPrompt: "",
            sourceGroupNodeId: source?.id ?? null,
            durationMinutes: 0,
            maxAnswers: 0,
            resultDisplayMode: "MANUAL",
          },
        },
      });
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
      return created;
    });
  }

  async updateGroupDiscussion(id: string, nodeId: string, body: UpdateGroupDiscussionDto) {
    const node = await this.prisma.presentationNode.findFirst({ where: { id: nodeId, presentationId: id } });
    if (!node) throw new NotFoundException("Gruppendiskussion nicht gefunden");
    if (node.type !== "GROUP_DISCUSSION") throw new BadRequestException("Diese Seite ist keine Gruppendiskussion");
    if (body.sourceGroupNodeId) {
      const source = await this.prisma.presentationNode.findFirst({ where: { id: body.sourceGroupNodeId, presentationId: id } });
      if (!source || source.type !== "GROUP_PAGE") throw new BadRequestException("Die Gruppenquelle ist keine Seite zur Gruppenerstellung");
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.presentationNode.update({
        where: { id: nodeId },
        data: {
          config: {
            question: body.question.trim(),
            prompt: body.prompt.trim(),
            resultPrompt: body.resultPrompt.trim(),
            sourceGroupNodeId: body.sourceGroupNodeId ?? null,
            durationMinutes: body.durationMinutes,
            maxAnswers: body.maxAnswers,
            resultDisplayMode: "MANUAL",
          },
        },
      });
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
      return updated;
    });
  }

  async addGroupPresentation(id: string) {
    const presentation = await this.get(id);
    const aggregate = await this.prisma.presentationNode.aggregate({ where: { presentationId: id }, _max: { position: true } });
    const source = [...presentation.nodes].reverse().find((node) => node.type === "GROUP_DISCUSSION");
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.presentationNode.create({
        data: {
          presentationId: id,
          position: (aggregate._max.position ?? -1) + 1,
          type: "GROUP_PRESENTATION",
          config: {
            question: "Ergebnisse aus den Gruppen",
            sourceGroupNodeId: source?.id ?? null,
          },
        },
      });
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
      return created;
    });
  }

  async updateGroupPresentation(id: string, nodeId: string, body: UpdateGroupPresentationDto) {
    const node = await this.prisma.presentationNode.findFirst({ where: { id: nodeId, presentationId: id } });
    if (!node) throw new NotFoundException("Seite für Gruppenergebnisse nicht gefunden");
    if (node.type !== "GROUP_PRESENTATION") throw new BadRequestException("Diese Seite zeigt keine Gruppenergebnisse");
    if (body.sourceGroupNodeId) {
      const source = await this.prisma.presentationNode.findFirst({ where: { id: body.sourceGroupNodeId, presentationId: id } });
      if (!source || source.type !== "GROUP_DISCUSSION") throw new BadRequestException("Die Ergebnisquelle ist keine Gruppendiskussion");
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.presentationNode.update({
        where: { id: nodeId },
        data: { config: { question: body.question.trim(), sourceGroupNodeId: body.sourceGroupNodeId ?? null } },
      });
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
      return updated;
    });
  }

  async addPriorityVote(id: string) {
    const presentation = await this.get(id);
    const aggregate = await this.prisma.presentationNode.aggregate({ where: { presentationId: id }, _max: { position: true } });
    const source = [...presentation.nodes].reverse().find((node) => node.type === "GROUP_DISCUSSION");
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.presentationNode.create({
        data: {
          presentationId: id,
          position: (aggregate._max.position ?? -1) + 1,
          type: "PRIORITY_VOTE",
          config: {
            question: "Welche Ergebnisse sind am wichtigsten?",
            sourceGroupNodeId: source?.id ?? null,
            maxVotes: 3,
            maxVisibleResults: 5,
            resultDisplayMode: "LIVE",
          },
        },
      });
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
      return created;
    });
  }

  async updatePriorityVote(id: string, nodeId: string, body: UpdatePriorityVoteDto) {
    const node = await this.prisma.presentationNode.findFirst({ where: { id: nodeId, presentationId: id } });
    if (!node) throw new NotFoundException("Priorisierungsseite nicht gefunden");
    if (node.type !== "PRIORITY_VOTE") throw new BadRequestException("Diese Seite ist keine Priorisierung");
    if (body.sourceGroupNodeId) {
      const source = await this.prisma.presentationNode.findFirst({ where: { id: body.sourceGroupNodeId, presentationId: id } });
      if (!source || (source.type !== "GROUP_DISCUSSION" && source.type !== "GROUP_PAGE")) throw new BadRequestException("Die Ergebnisquelle ist keine Gruppendiskussion");
    }
    const currentConfig = node.config as { maxVisibleResults?: number };
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.presentationNode.update({
        where: { id: nodeId },
        data: { config: { question: body.question.trim(), sourceGroupNodeId: body.sourceGroupNodeId ?? null, maxVotes: body.maxVotes, maxVisibleResults: body.maxVisibleResults ?? currentConfig.maxVisibleResults ?? 5, resultDisplayMode: body.resultDisplayMode } },
      });
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
      return updated;
    });
  }

  async uploadImage(id: string, file: Express.Multer.File) {
    await this.get(id);
    const isPng = file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
    const isWebp = file.buffer.subarray(0, 4).toString() === "RIFF" && file.buffer.subarray(8, 12).toString() === "WEBP";
    const extension = isPng ? "png" : isJpeg ? "jpg" : isWebp ? "webp" : null;
    if (!extension) throw new BadRequestException("Nur PNG-, JPEG- und WebP-Bilder werden unterstützt");

    const storageRoot = resolve(process.env.STORAGE_PATH ?? "../../storage");
    const imageDirectory = resolve(storageRoot, "images");
    await mkdir(imageDirectory, { recursive: true });
    const objectKey = `${randomUUID()}.${extension}`;
    await writeFile(resolve(imageDirectory, objectKey), file.buffer, { flag: "wx" });
    return { objectKey, originalName: file.originalname };
  }

  private normalizeFreeformConfig(body: UpdateFreeformPageDto): Prisma.InputJsonObject {
    const ids = new Set<string>();
    const elements = body.elements.map((raw) => {
      const id = this.freeformString(raw.id, "Element-ID", 80);
      if (!/^[a-f0-9-]{16,80}$/i.test(id) || ids.has(id)) {
        throw new BadRequestException("Element-IDs müssen eindeutig sein");
      }
      ids.add(id);
      const type = raw.type;
      if (type !== "TEXT" && type !== "IMAGE") {
        throw new BadRequestException("Unbekannter Elementtyp");
      }
      const base = {
        id,
        type,
        x: this.freeformNumber(raw.x, 0, 1600, "X-Position"),
        y: this.freeformNumber(raw.y, 0, 900, "Y-Position"),
        width: this.freeformNumber(raw.width, 20, 1600, "Breite"),
        height: this.freeformNumber(raw.height, 20, 900, "Höhe"),
      };
      if (type === "TEXT") {
        const fontWeight = raw.fontWeight === 700 ? 700 : 400;
        const fontStyle = raw.fontStyle === "italic" ? "italic" : "normal";
        const textAlign = ["left", "center", "right"].includes(String(raw.textAlign)) ? String(raw.textAlign) : "left";
        const listStyle = ["bullet", "number"].includes(String(raw.listStyle)) ? String(raw.listStyle) : "none";
        return {
          ...base,
          text: this.freeformString(raw.text, "Text", 5000),
          fontSize: this.freeformNumber(raw.fontSize, 8, 200, "Schriftgröße"),
          color: this.freeformColor(raw.color, "Textfarbe"),
          fontWeight,
          fontStyle,
          textAlign,
          listStyle,
        };
      }
      const objectKey = this.freeformString(raw.objectKey, "Bild", 80);
      if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/i.test(objectKey)) {
        throw new BadRequestException("Ungültiger Bildverweis");
      }
      return { ...base, objectKey, objectFit: raw.objectFit === "cover" ? "cover" : "contain" };
    });
    return { backgroundColor: this.freeformColor(body.backgroundColor, "Hintergrundfarbe"), elements };
  }

  private freeformNumber(value: unknown, min: number, max: number, label: string) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      throw new BadRequestException(`${label} ist ungültig`);
    }
    return Math.round(value * 100) / 100;
  }

  private freeformString(value: unknown, label: string, maxLength: number) {
    if (typeof value !== "string" || value.length > maxLength) {
      throw new BadRequestException(`${label} ist ungültig`);
    }
    return value;
  }

  private freeformColor(value: unknown, label: string) {
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
      throw new BadRequestException(`${label} ist ungültig`);
    }
    return value.toLowerCase();
  }

  async updateRating(id: string, nodeId: string, body: CreateRatingDto) {
    const node = await this.prisma.presentationNode.findFirst({
      where: { id: nodeId, presentationId: id },
    });
    if (!node) throw new NotFoundException("Skalenfrage nicht gefunden");
    if (node.type !== "RATING") throw new BadRequestException("Diese Seite ist keine Skalenfrage");
    this.validateRatingRange(body.min, body.max);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.presentationNode.update({
        where: { id: nodeId },
        data: { config: this.ratingConfig(body) },
      });
      await tx.presentation.update({ where: { id }, data: { revision: { increment: 1 } } });
      return updated;
    });
  }

  private validateRatingRange(min: number, max: number) {
    if (max <= min || max - min > 100) {
      throw new BadRequestException("Die Skala benötigt einen gültigen Bereich");
    }
  }

  private ratingConfig(body: CreateRatingDto): Prisma.InputJsonObject {
    const statements = (body.statements ?? [body.question]).map((statement) => statement.trim());
    if (statements.some((statement) => !statement)) {
      throw new BadRequestException("Alle Aussagen müssen einen Text enthalten");
    }
    return {
      question: body.question.trim(),
      statements,
      min: body.min,
      max: body.max,
      minLabel: body.minLabel.trim(),
      maxLabel: body.maxLabel.trim(),
      options: Array.from({ length: body.max - body.min + 1 }, (_, index) => String(body.min + index)),
      maxSelections: 1,
      resultDisplayMode: body.resultDisplayMode ?? "MANUAL",
    };
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
