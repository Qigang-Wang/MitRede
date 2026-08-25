import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InteractionStatus, Prisma } from "@prisma/client";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { PrismaService } from "../database/prisma.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import type { SubmitAnswerDto } from "./dto/submit-answer.dto";
import type { UpdateSessionDto } from "./dto/update-session.dto";

type PollConfig = {
  question: string;
  options: string[];
  maxSelections?: number;
  resultDisplayMode?: "MANUAL" | "LIVE";
};

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private async roomCode() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = randomInt(100000, 1000000).toString();
      const exists = await this.prisma.liveSession.findUnique({ where: { roomCode: code } });
      if (!exists) return code;
    }
    throw new ConflictException("Raumcode konnte nicht erzeugt werden");
  }

  async list() {
    const sessions = await this.prisma.liveSession.findMany({
      orderBy: { startedAt: "desc" },
      include: {
        presentation: {
          select: {
            id: true,
            title: true,
            nodes: { select: { type: true } },
          },
        },
        _count: { select: { participants: true, answers: true } },
      },
    });

    return sessions.map((session) => ({
      id: session.id,
      roomCode: session.roomCode,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      presentation: {
        id: session.presentation.id,
        title: session.presentation.title,
      },
      participantCount: session._count.participants,
      answerCount: session._count.answers,
      interactionCount: session.presentation.nodes.filter((node) => node.type !== "PDF_PAGE").length,
    }));
  }

  async results(id: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { id },
      include: {
        presentation: {
          include: { nodes: { orderBy: { position: "asc" } } },
        },
        answers: {
          where: { isHidden: false },
          select: { nodeId: true, value: true },
        },
        _count: { select: { participants: true, answers: true } },
      },
    });
    if (!session) throw new NotFoundException("Sitzung nicht gefunden");

    const questions = session.presentation.nodes
      .filter((node) => node.type !== "PDF_PAGE")
      .map((node) => {
        const config = node.config as PollConfig;
        const answers = session.answers.filter((answer) => answer.nodeId === node.id);
        const counts = Array.from({ length: config.options?.length ?? 0 }, () => 0);
        for (const answer of answers) {
          const value = answer.value as { optionIndex?: number };
          if (typeof value.optionIndex === "number" && counts[value.optionIndex] !== undefined) {
            counts[value.optionIndex] = (counts[value.optionIndex] ?? 0) + 1;
          }
        }
        return {
          nodeId: node.id,
          position: node.position,
          type: node.type,
          question: config.question ?? "Interaktion",
          options: config.options ?? [],
          total: answers.length,
          counts,
        };
      });

    return {
      sessionId: session.id,
      roomCode: session.roomCode,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      presentation: {
        id: session.presentation.id,
        title: session.presentation.title,
      },
      participantCount: session._count.participants,
      answerCount: session._count.answers,
      questions,
    };
  }

  async end(id: string) {
    const existing = await this.prisma.liveSession.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Sitzung nicht gefunden");
    if (existing.status !== "ENDED") {
      const session = await this.prisma.liveSession.update({
        where: { id },
        data: {
          status: "ENDED",
          interactionStatus: "LOCKED",
          resultsVisible: true,
          endedAt: new Date(),
          stateVersion: { increment: 1 },
        },
      });
      this.broadcast(session.id, session.stateVersion, "session.ended");
    }
    return this.results(id);
  }

  async create(presentationId: string) {
    const presentation = await this.prisma.presentation.findUnique({
      where: { id: presentationId },
      include: { nodes: { orderBy: { position: "asc" } }, owner: true },
    });
    if (!presentation) throw new NotFoundException("Präsentation nicht gefunden");
    const currentNode = presentation.nodes[0];
    if (!currentNode) throw new BadRequestException("Die Präsentation enthält keine Seiten");

    const currentConfig = currentNode.config as PollConfig;
    const session = await this.prisma.liveSession.create({
      data: {
        presentationId,
        roomCode: await this.roomCode(),
        status: "LIVE",
        currentNodeId: currentNode.id,
        interactionStatus:
          currentNode.type === "MULTIPLE_CHOICE" ? "ACCEPTING" : "NOT_OPEN",
        resultsVisible:
          currentNode.type === "MULTIPLE_CHOICE" && currentConfig.resultDisplayMode === "LIVE",
        controllerUserId: presentation.ownerId,
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
    });
    return this.snapshotById(session.id);
  }

  async snapshotById(id: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { id },
      include: {
        presentation: { include: { nodes: { orderBy: { position: "asc" } } } },
        currentNode: true,
      },
    });
    if (!session) throw new NotFoundException("Sitzung nicht gefunden");
    return this.buildSnapshot(session, true);
  }

  async snapshotByRoom(roomCode: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { roomCode: roomCode.replace(/\s/g, "") },
      include: { presentation: true, currentNode: true },
    });
    if (!session) throw new NotFoundException("Raum nicht gefunden");
    return this.buildSnapshot(session, false);
  }

  private async buildSnapshot(session: {
    id: string;
    roomCode: string;
    status: string;
    interactionStatus: string;
    resultsVisible: boolean;
    stateVersion: number;
    currentNodeId: string | null;
    presentation: { id: string; title: string; nodes?: Array<{ id: string; position: number; type: string; config: Prisma.JsonValue; sourcePageNumber: number | null }> };
    currentNode: { id: string; type: string; config: Prisma.JsonValue } | null;
  }, includeTimeline: boolean) {
    const answers = session.currentNodeId
      ? await this.prisma.answer.findMany({
          where: {
            liveSessionId: session.id,
            nodeId: session.currentNodeId,
            isHidden: false,
          },
          select: { value: true },
        })
      : [];
    const config = (session.currentNode?.config ?? {}) as PollConfig;
    const counts = Array.from({ length: config.options?.length ?? 0 }, () => 0);
    for (const answer of answers) {
      const value = answer.value as { optionIndex?: number };
      if (typeof value.optionIndex === "number" && counts[value.optionIndex] !== undefined) {
        counts[value.optionIndex] = (counts[value.optionIndex] ?? 0) + 1;
      }
    }

    return {
      sessionId: session.id,
      roomCode: session.roomCode,
      status: session.status,
      interactionStatus: session.interactionStatus,
      resultsVisible: session.resultsVisible,
      stateVersion: session.stateVersion,
      presentation: session.presentation,
      currentNode: session.currentNode
        ? { ...session.currentNode, config }
        : null,
      timeline: includeTimeline ? (session.presentation.nodes ?? []) : undefined,
      results: { total: answers.length, counts },
    };
  }

  async submitAnswer(roomCode: string, body: SubmitAnswerDto) {
    const session = await this.prisma.liveSession.findUnique({
      where: { roomCode: roomCode.replace(/\s/g, "") },
      include: { currentNode: true },
    });
    if (!session) throw new NotFoundException("Raum nicht gefunden");
    if (session.status !== "LIVE" || session.interactionStatus !== "ACCEPTING") {
      throw new ConflictException("Diese Frage nimmt derzeit keine Antworten an");
    }
    if (!session.currentNode || session.currentNode.id !== body.nodeId) {
      throw new ConflictException("Die Frage ist nicht mehr aktuell");
    }
    const config = session.currentNode.config as PollConfig;
    if (!config.options?.[body.optionIndex]) {
      throw new BadRequestException("Ungültige Antwortoption");
    }

    const tokenHash = createHash("sha256")
      .update(`${session.id}:${body.participantToken}`)
      .digest("hex");

    const updated = await this.prisma.$transaction(async (tx) => {
      const participant = await tx.participantSession.upsert({
        where: { anonymousTokenHash: tokenHash },
        update: { lastSeenAt: new Date() },
        create: { liveSessionId: session.id, anonymousTokenHash: tokenHash },
      });
      await tx.answer.upsert({
        where: {
          liveSessionId_nodeId_participantId: {
            liveSessionId: session.id,
            nodeId: body.nodeId,
            participantId: participant.id,
          },
        },
        update: {
          value: { optionIndex: body.optionIndex },
          requestId: body.requestId,
        },
        create: {
          liveSessionId: session.id,
          nodeId: body.nodeId,
          participantId: participant.id,
          requestId: body.requestId,
          value: { optionIndex: body.optionIndex },
        },
      });
      return tx.liveSession.update({
        where: { id: session.id },
        data: { stateVersion: { increment: 1 } },
      });
    });

    this.broadcast(session.id, updated.stateVersion, "session.results_changed");
    return this.snapshotByRoom(session.roomCode);
  }

  async update(id: string, body: UpdateSessionDto) {
    if (
      body.interactionStatus === undefined &&
      body.resultsVisible === undefined &&
      body.currentNodeId === undefined
    ) {
      throw new BadRequestException("Keine Änderung angegeben");
    }
    const data: Prisma.LiveSessionUpdateInput = {
      stateVersion: { increment: 1 },
    };
    if (body.interactionStatus !== undefined) {
      data.interactionStatus = body.interactionStatus as InteractionStatus;
    }
    if (body.resultsVisible !== undefined) data.resultsVisible = body.resultsVisible;
    if (body.currentNodeId !== undefined) {
      const session = await this.prisma.liveSession.findUnique({ where: { id } });
      if (!session) throw new NotFoundException("Sitzung nicht gefunden");
      const node = await this.prisma.presentationNode.findFirst({
        where: { id: body.currentNodeId, presentationId: session.presentationId },
      });
      if (!node) throw new BadRequestException("Seite gehört nicht zu dieser Präsentation");
      data.currentNode = { connect: { id: node.id } };
      data.interactionStatus = node.type === "MULTIPLE_CHOICE" ? "ACCEPTING" : "NOT_OPEN";
      const nodeConfig = node.config as PollConfig;
      data.resultsVisible = node.type === "MULTIPLE_CHOICE" && nodeConfig.resultDisplayMode === "LIVE";
    }

    const session = await this.prisma.liveSession.update({ where: { id }, data }).catch(() => null);
    if (!session) throw new NotFoundException("Sitzung nicht gefunden");
    this.broadcast(session.id, session.stateVersion, "session.state_changed");
    return this.snapshotById(session.id);
  }

  private broadcast(sessionId: string, stateVersion: number, type: string) {
    this.realtime.emitSessionEvent(sessionId, {
      eventId: randomUUID(),
      sessionId,
      stateVersion,
      occurredAt: new Date().toISOString(),
      type,
      payload: {},
    });
  }
}
