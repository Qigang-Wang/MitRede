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

  async create(presentationId: string) {
    const presentation = await this.prisma.presentation.findUnique({
      where: { id: presentationId },
      include: { nodes: { orderBy: { position: "asc" } }, owner: true },
    });
    if (!presentation) throw new NotFoundException("Präsentation nicht gefunden");
    const currentNode =
      presentation.nodes.find((node) => node.type === "MULTIPLE_CHOICE") ??
      presentation.nodes[0];
    if (!currentNode) throw new BadRequestException("Die Präsentation enthält keine Seiten");

    const session = await this.prisma.liveSession.create({
      data: {
        presentationId,
        roomCode: await this.roomCode(),
        status: "LIVE",
        currentNodeId: currentNode.id,
        interactionStatus:
          currentNode.type === "MULTIPLE_CHOICE" ? "ACCEPTING" : "NOT_OPEN",
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
      include: { presentation: true, currentNode: true },
    });
    if (!session) throw new NotFoundException("Sitzung nicht gefunden");
    return this.buildSnapshot(session);
  }

  async snapshotByRoom(roomCode: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { roomCode: roomCode.replace(/\s/g, "") },
      include: { presentation: true, currentNode: true },
    });
    if (!session) throw new NotFoundException("Raum nicht gefunden");
    return this.buildSnapshot(session);
  }

  private async buildSnapshot(session: {
    id: string;
    roomCode: string;
    status: string;
    interactionStatus: string;
    resultsVisible: boolean;
    stateVersion: number;
    currentNodeId: string | null;
    presentation: { id: string; title: string };
    currentNode: { id: string; type: string; config: Prisma.JsonValue } | null;
  }) {
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
    return this.snapshotById(session.id);
  }

  async update(id: string, body: UpdateSessionDto) {
    if (body.interactionStatus === undefined && body.resultsVisible === undefined) {
      throw new BadRequestException("Keine Änderung angegeben");
    }
    const data: Prisma.LiveSessionUpdateInput = {
      stateVersion: { increment: 1 },
    };
    if (body.interactionStatus !== undefined) {
      data.interactionStatus = body.interactionStatus as InteractionStatus;
    }
    if (body.resultsVisible !== undefined) data.resultsVisible = body.resultsVisible;

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
