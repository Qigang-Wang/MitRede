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
import type { CreateGroupDto } from "./dto/create-group.dto";
import type { JoinGroupDto } from "./dto/join-group.dto";
import type { SubmitGroupResultDto } from "./dto/submit-group-result.dto";
import type { SubmitPriorityVoteDto } from "./dto/submit-priority-vote.dto";
import type { RegisterParticipantDto } from "./dto/register-participant.dto";
import { buildPriorityPoints, type PriorityPoint } from "./priority-points";
import { aggregateScaleResults, scaleSelectionIndexes, type ScaleAnswerValue } from "./scale-results";

type PollConfig = {
  question: string;
  options: string[];
  maxSelections?: number;
  resultDisplayMode?: "MANUAL" | "LIVE";
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  assessmentMode?: "FEEDBACK" | "QUIZ";
  correctOptionIndex?: number;
  prompt?: string;
  resultPrompt?: string;
  maxGroups?: number;
  sourceGroupNodeId?: string | null;
  maxVotes?: number;
  maxVisibleResults?: number;
  durationMinutes?: number;
  maxAnswers?: number;
  statements?: string[];
};

type GroupValue = { groupId?: string; groupName?: string; result?: string; answers?: string[]; completed?: boolean };
type PriorityVoteValue = { pointIds?: string[] };
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
      where: { isPreview: false },
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
      interactionCount: session.presentation.nodes.filter((node) => node.type === "MULTIPLE_CHOICE" || node.type === "RATING" || node.type === "GROUP_PAGE" || node.type === "GROUP_DISCUSSION" || node.type === "GROUP_PRESENTATION" || node.type === "PRIORITY_VOTE").length,
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
          select: { nodeId: true, value: true, updatedAt: true },
        },
        _count: { select: { participants: true, answers: true } },
      },
    });
    if (!session) throw new NotFoundException("Sitzung nicht gefunden");

    const questions = session.presentation.nodes
      .filter((node) => node.type === "MULTIPLE_CHOICE" || node.type === "RATING" || node.type === "PRIORITY_VOTE")
      .map((node) => {
        const config = node.config as PollConfig;
        const answers = session.answers.filter((answer) => answer.nodeId === node.id);
        if (node.type === "PRIORITY_VOTE") {
          const points = this.priorityPoints(config.sourceGroupNodeId, session.answers);
          const counts = points.map(() => 0);
          const pointIndex = new Map(points.map((point, index) => [point.id, index]));
          for (const answer of answers) {
            const value = answer.value as PriorityVoteValue;
            for (const pointId of value.pointIds ?? []) {
              const index = pointIndex.get(pointId);
              if (index !== undefined) counts[index] = (counts[index] ?? 0) + 1;
            }
          }
          const ranked = points
            .map((point, index) => ({ point, count: counts[index] ?? 0, sourceIndex: index }))
            .sort((a, b) => b.count - a.count || a.sourceIndex - b.sourceIndex);
          return {
            nodeId: node.id,
            position: node.position,
            type: node.type,
            question: config.question ?? "Priorisierung",
            options: ranked.map(({ point }) => point.text),
            optionGroups: ranked.map(({ point }) => point.groupName),
            maxSelections: config.maxVotes ?? 3,
            assessmentMode: "FEEDBACK" as const,
            total: answers.length,
            counts: ranked.map(({ count }) => count),
          };
        }
        if (node.type === "RATING" && (config.statements?.length ?? 0) > 1) {
          const optionValues = (config.options ?? []).map(Number);
          const statements = config.statements ?? [];
          const scaleStatements = aggregateScaleResults(
            answers.map((answer) => answer.value as ScaleAnswerValue),
            statements.length,
            optionValues,
          ).map((result, index) => ({ text: statements[index] ?? `Aussage ${index + 1}`, ...result }));
          return {
            nodeId: node.id,
            position: node.position,
            type: node.type,
            question: config.question ?? "Bewertungsskalen",
            options: config.options ?? [],
            min: config.min,
            max: config.max,
            minLabel: config.minLabel,
            maxLabel: config.maxLabel,
            assessmentMode: "FEEDBACK" as const,
            total: answers.length,
            counts: scaleStatements[0]?.counts ?? optionValues.map(() => 0),
            scaleStatements,
          };
        }
        const counts = Array.from({ length: config.options?.length ?? 0 }, () => 0);
        for (const answer of answers) {
          const value = answer.value as { optionIndex?: number };
          if (typeof value.optionIndex === "number" && counts[value.optionIndex] !== undefined) {
            counts[value.optionIndex] = (counts[value.optionIndex] ?? 0) + 1;
          }
        }
        const correctCount = config.assessmentMode === "QUIZ"
          ? answers.filter((answer) => (answer.value as { optionIndex?: number }).optionIndex === config.correctOptionIndex).length
          : undefined;
        return {
          nodeId: node.id,
          position: node.position,
          type: node.type,
          question: config.question ?? "Interaktion",
          options: config.options ?? [],
          min: config.min,
          max: config.max,
          minLabel: config.minLabel,
          maxLabel: config.maxLabel,
          assessmentMode: config.assessmentMode ?? "FEEDBACK",
          correctOptionIndex: config.correctOptionIndex,
          correctCount,
          total: answers.length,
          counts,
        };
      });

    const groupDiscussions = session.presentation.nodes
      .filter((node) => node.type === "GROUP_DISCUSSION")
      .map((node) => {
        const config = node.config as PollConfig;
        const grouped = new Map<string, { id: string; name: string; memberCount: number; result: string; answers: string[]; completed: boolean; resultUpdatedAt: number }>();
        const membershipNodeId = node.type === "GROUP_DISCUSSION" ? config.sourceGroupNodeId : node.id;
        for (const answer of session.answers.filter((entry) => entry.nodeId === membershipNodeId)) {
          const value = answer.value as GroupValue;
          if (typeof value.groupId !== "string" || typeof value.groupName !== "string") continue;
          const group = grouped.get(value.groupId) ?? { id: value.groupId, name: value.groupName, memberCount: 0, result: "", answers: [], completed: false, resultUpdatedAt: 0 };
          group.memberCount += 1;
          grouped.set(value.groupId, group);
        }
        for (const answer of session.answers.filter((entry) => entry.nodeId === node.id)) {
          const value = answer.value as GroupValue;
          if (typeof value.groupId !== "string" || typeof value.groupName !== "string") continue;
          const group = grouped.get(value.groupId) ?? { id: value.groupId, name: value.groupName, memberCount: 0, result: "", answers: [], completed: false, resultUpdatedAt: 0 };
          const groupAnswers = this.groupAnswers(value);
          if (answer.updatedAt.getTime() >= group.resultUpdatedAt) {
            group.answers = groupAnswers;
            group.result = groupAnswers.join("\n");
            group.completed = value.completed === true;
            group.resultUpdatedAt = answer.updatedAt.getTime();
          }
          grouped.set(value.groupId, group);
        }
        return {
          nodeId: node.id,
          position: node.position,
          question: config.question ?? "Gruppendiskussion",
          groups: [...grouped.values()].map(({ resultUpdatedAt: _resultUpdatedAt, ...group }) => group).sort((a, b) => a.name.localeCompare(b.name, "de")),
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
      groupDiscussions,
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

  async remove(id: string) {
    const session = await this.prisma.liveSession.findUnique({ where: { id }, select: { id: true, stateVersion: true } });
    if (!session) throw new NotFoundException("Sitzung nicht gefunden");
    await this.prisma.liveSession.delete({ where: { id } });
    this.broadcast(session.id, session.stateVersion + 1, "session.deleted");
    return { removed: true };
  }

  async create(presentationId: string, isPreview = false) {
    const presentation = await this.prisma.presentation.findUnique({
      where: { id: presentationId },
      include: { nodes: { orderBy: { position: "asc" } }, owner: true },
    });
    if (!presentation) throw new NotFoundException("Präsentation nicht gefunden");
    const currentNode = presentation.nodes[0];
    if (!currentNode) throw new BadRequestException("Die Präsentation enthält keine Seiten");

    const currentConfig = currentNode.config as PollConfig;
    const isInteractive = currentNode.type === "MULTIPLE_CHOICE" || currentNode.type === "RATING" || currentNode.type === "GROUP_PAGE" || currentNode.type === "GROUP_DISCUSSION" || currentNode.type === "PRIORITY_VOTE";
    const discussionDuration = Math.min(180, Math.max(0, Number(currentConfig.durationMinutes ?? 0))) * 60;
    const session = await this.prisma.liveSession.create({
      data: {
        presentationId,
        roomCode: await this.roomCode(),
        isPreview,
        status: "LIVE",
        currentNodeId: currentNode.id,
        interactionStatus: isInteractive ? "ACCEPTING" : "NOT_OPEN",
        resultsVisible:
          isInteractive && currentConfig.resultDisplayMode === "LIVE",
        timerStartedAt: currentNode.type === "GROUP_DISCUSSION" && discussionDuration > 0 ? new Date() : null,
        timerRemainingSec: currentNode.type === "GROUP_DISCUSSION" && discussionDuration > 0 ? discussionDuration : null,
        timerRunning: currentNode.type === "GROUP_DISCUSSION" && discussionDuration > 0,
        controllerUserId: presentation.ownerId,
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
    });
    return this.snapshotById(session.id);
  }

  async removePreview(id: string) {
    const session = await this.prisma.liveSession.findUnique({ where: { id }, select: { isPreview: true } });
    if (!session) return { removed: true };
    if (!session.isPreview) throw new BadRequestException("Diese Sitzung ist keine Vorschau");
    await this.prisma.liveSession.delete({ where: { id } });
    return { removed: true };
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

  async snapshotByRoom(roomCode: string, participantToken?: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { roomCode: roomCode.replace(/\s/g, "") },
      include: { presentation: true, currentNode: true },
    });
    if (!session) throw new NotFoundException("Raum nicht gefunden");
    return this.buildSnapshot(session, false, participantToken);
  }

  async registerParticipant(roomCode: string, body: RegisterParticipantDto) {
    const session = await this.prisma.liveSession.findUnique({ where: { roomCode: roomCode.replace(/\s/g, "") } });
    if (!session || session.status !== "LIVE") throw new NotFoundException("Raum nicht gefunden");
    const displayName = body.displayName.trim();
    if (!displayName) throw new BadRequestException("Name fehlt");
    const anonymousTokenHash = this.participantTokenHash(session.id, body.participantToken);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.participantSession.upsert({
        where: { anonymousTokenHash },
        update: { displayName, lastSeenAt: new Date() },
        create: { liveSessionId: session.id, anonymousTokenHash, displayName },
      });
      return tx.liveSession.update({ where: { id: session.id }, data: { stateVersion: { increment: 1 } } });
    });
    this.broadcast(session.id, updated.stateVersion, "session.participants_changed");
    return this.snapshotByRoom(session.roomCode, body.participantToken);
  }

  private async buildSnapshot(session: {
    id: string;
    roomCode: string;
    status: string;
    interactionStatus: string;
    resultsVisible: boolean;
    timerStartedAt: Date | null;
    timerRemainingSec: number | null;
    timerRunning: boolean;
    activeGroupIndex: number;
    stateVersion: number;
    currentNodeId: string | null;
    presentation: { id: string; title: string; nodes?: Array<{ id: string; position: number; type: string; config: Prisma.JsonValue; sourcePageNumber: number | null }> };
    currentNode: { id: string; type: string; config: Prisma.JsonValue } | null;
  }, includeTimeline: boolean, participantToken?: string) {
    const answers = session.currentNodeId
      ? await this.prisma.answer.findMany({
          where: {
            liveSessionId: session.id,
            nodeId: session.currentNodeId,
            isHidden: false,
          },
          select: { value: true, participantId: true, updatedAt: true, participant: { select: { displayName: true } } },
        })
      : [];
    const participantCount = await this.prisma.participantSession.count({
      where: { liveSessionId: session.id },
    });
    const config = (session.currentNode?.config ?? {}) as PollConfig;
    const isGroupPresentation = session.currentNode?.type === "GROUP_PRESENTATION";
    const sourceDiscussionNode = isGroupPresentation && config.sourceGroupNodeId
      ? await this.prisma.presentationNode.findFirst({ where: { id: config.sourceGroupNodeId, presentationId: session.presentation.id }, select: { id: true, config: true } })
      : null;
    const sourceDiscussionConfig = (sourceDiscussionNode?.config ?? {}) as PollConfig;
    const membershipNodeId = session.currentNode?.type === "GROUP_DISCUSSION"
      ? config.sourceGroupNodeId
      : isGroupPresentation
      ? sourceDiscussionConfig.sourceGroupNodeId
      : session.currentNodeId;
    const membershipAnswers = membershipNodeId && membershipNodeId !== session.currentNodeId
      ? await this.prisma.answer.findMany({
          where: { liveSessionId: session.id, nodeId: membershipNodeId, isHidden: false },
          select: { value: true, participantId: true, updatedAt: true, participant: { select: { displayName: true } } },
        })
      : answers;
    const scaleStatementTexts = session.currentNode?.type === "RATING" && (config.statements?.length ?? 0) > 1 ? config.statements ?? [] : [];
    const scaleAggregates = scaleStatementTexts.length
      ? aggregateScaleResults(answers.map((answer) => answer.value as ScaleAnswerValue), scaleStatementTexts.length, (config.options ?? []).map(Number))
      : null;
    const counts = scaleAggregates?.[0]?.counts ?? Array.from({ length: config.options?.length ?? 0 }, () => 0);
    if (!scaleAggregates) {
      for (const answer of answers) {
        const value = answer.value as { optionIndex?: number };
        if (typeof value.optionIndex === "number" && counts[value.optionIndex] !== undefined) {
          counts[value.optionIndex] = (counts[value.optionIndex] ?? 0) + 1;
        }
      }
    }
    const grouped = new Map<string, { id: string; name: string; memberCount: number; memberNames: string[]; result: string; answers: string[]; completed: boolean; resultUpdatedAt: number }>();
    for (const answer of membershipAnswers) {
      const value = answer.value as GroupValue;
      if (typeof value.groupId !== "string" || typeof value.groupName !== "string") continue;
      const group = grouped.get(value.groupId) ?? { id: value.groupId, name: value.groupName, memberCount: 0, memberNames: [], result: "", answers: [], completed: false, resultUpdatedAt: 0 };
      group.memberCount += 1;
      group.memberNames.push(answer.participant.displayName?.trim() || `Teilnehmer ${group.memberCount}`);
      if ((typeof value.result === "string" || Array.isArray(value.answers)) && answer.updatedAt.getTime() >= group.resultUpdatedAt) {
        group.answers = this.groupAnswers(value);
        group.result = group.answers.join("\n");
        group.completed = value.completed === true;
        group.resultUpdatedAt = answer.updatedAt.getTime();
      }
      grouped.set(value.groupId, group);
    }
    const discussionAnswers = isGroupPresentation && sourceDiscussionNode
      ? await this.prisma.answer.findMany({
          where: { liveSessionId: session.id, nodeId: sourceDiscussionNode.id, isHidden: false },
          select: { value: true, participantId: true, updatedAt: true, participant: { select: { displayName: true } } },
        })
      : answers;
    if (session.currentNode?.type === "GROUP_DISCUSSION" || isGroupPresentation) {
      for (const answer of discussionAnswers) {
        const value = answer.value as GroupValue;
        if (typeof value.groupId !== "string" || typeof value.groupName !== "string") continue;
        const group = grouped.get(value.groupId);
        if (!group) continue;
        if (answer.updatedAt.getTime() >= group.resultUpdatedAt) {
          group.answers = this.groupAnswers(value);
          group.result = group.answers.join("\n");
          group.completed = value.completed === true;
          group.resultUpdatedAt = answer.updatedAt.getTime();
        }
      }
    }
    let participantId: string | null = null;
    if (participantToken) {
      const tokenHash = this.participantTokenHash(session.id, participantToken);
      const participant = await this.prisma.participantSession.findUnique({ where: { anonymousTokenHash: tokenHash }, select: { id: true } });
      participantId = participant?.id ?? null;
    }
    let participantGroupId: string | null = null;
    if (participantId) {
      const ownAnswer = membershipAnswers.find((answer) => answer.participantId === participantId);
      const ownValue = ownAnswer?.value as GroupValue | undefined;
      participantGroupId = typeof ownValue?.groupId === "string" ? ownValue.groupId : null;
    }
    let priorityVote: { maxVotes: number; points: Array<PriorityPoint & { count: number }>; selectedPointIds: string[] } | null = null;
    if (session.currentNode?.type === "PRIORITY_VOTE") {
      const sourceAnswers = config.sourceGroupNodeId
        ? await this.prisma.answer.findMany({
            where: { liveSessionId: session.id, nodeId: config.sourceGroupNodeId, isHidden: false },
            select: { value: true, updatedAt: true },
          })
        : [];
      const points = this.priorityPoints(config.sourceGroupNodeId, sourceAnswers);
      const countsById = new Map(points.map((point) => [point.id, 0]));
      for (const answer of answers) {
        const value = answer.value as PriorityVoteValue;
        for (const pointId of value.pointIds ?? []) {
          if (countsById.has(pointId)) countsById.set(pointId, (countsById.get(pointId) ?? 0) + 1);
        }
      }
      const ownAnswer = participantId ? answers.find((answer) => answer.participantId === participantId) : undefined;
      const selectedPointIds = ((ownAnswer?.value as PriorityVoteValue | undefined)?.pointIds ?? []).filter((id) => countsById.has(id));
      priorityVote = {
        maxVotes: Math.min(10, Math.max(1, Number(config.maxVotes ?? 3))),
        points: points
          .map((point, sourceIndex) => ({ ...point, count: includeTimeline || session.resultsVisible ? countsById.get(point.id) ?? 0 : 0, sourceIndex }))
          .sort((a, b) => b.count - a.count || a.sourceIndex - b.sourceIndex)
          .map(({ sourceIndex: _sourceIndex, ...point }) => point),
        selectedPointIds,
      };
    }
    let scaleVote: {
      options: string[];
      selectedOptionIndexes: number[];
      statements: Array<{ text: string; counts: number[]; total: number; average: number | null }>;
    } | null = null;
    if (scaleAggregates) {
      const ownAnswer = participantId ? answers.find((answer) => answer.participantId === participantId) : undefined;
      const canShowResults = includeTimeline || session.resultsVisible;
      scaleVote = {
        options: config.options ?? [],
        selectedOptionIndexes: ownAnswer ? scaleSelectionIndexes(ownAnswer.value as ScaleAnswerValue, scaleStatementTexts.length) : [],
        statements: scaleAggregates.map((result, index) => ({
          text: scaleStatementTexts[index] ?? `Aussage ${index + 1}`,
          counts: canShowResults ? result.counts : result.counts.map(() => 0),
          total: canShowResults ? result.total : 0,
          average: canShowResults ? result.average : null,
        })),
      };
    }
    const sortedGroups = [...grouped.values()]
      .map(({ resultUpdatedAt: _resultUpdatedAt, ...group }) => group)
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
    const activeGroupIndex = sortedGroups.length ? Math.min(session.activeGroupIndex, sortedGroups.length - 1) : 0;
    const activeGroup = isGroupPresentation ? sortedGroups[activeGroupIndex] ?? null : null;
    const publicConfig = { ...config };
    if (!includeTimeline && !session.resultsVisible) delete publicConfig.correctOptionIndex;

    return {
      sessionId: session.id,
      roomCode: session.roomCode,
      status: session.status,
      interactionStatus: session.interactionStatus,
      resultsVisible: session.resultsVisible,
      stateVersion: session.stateVersion,
      presentation: session.presentation,
      currentNode: session.currentNode
        ? { ...session.currentNode, config: publicConfig }
        : null,
      timeline: includeTimeline ? (session.presentation.nodes ?? []) : undefined,
      participantCount,
      results: { total: answers.length, counts },
      groups: sortedGroups.map((group) => ({
        ...group,
        result: includeTimeline || session.resultsVisible || group.id === participantGroupId || group.id === activeGroup?.id ? group.result : "",
        answers: includeTimeline || session.resultsVisible || group.id === participantGroupId || group.id === activeGroup?.id ? group.answers : [],
      })),
      participantGroupId,
      groupPresentation: isGroupPresentation ? { activeIndex: activeGroupIndex, total: sortedGroups.length, activeGroup } : null,
      priorityVote,
      scaleVote,
      discussionTimer: session.currentNode?.type === "GROUP_DISCUSSION" && Number(config.durationMinutes ?? 0) > 0 && session.timerRemainingSec !== null
        ? this.discussionTimer(session)
        : null,
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
    const isMultiScale = session.currentNode.type === "RATING" && (config.statements?.length ?? 0) > 1;
    let answerValue: { optionIndex: number } | { scaleValues: number[] };
    if (isMultiScale) {
      const scaleValues = body.scaleValues ?? [];
      if (scaleValues.length !== config.statements?.length) {
        throw new BadRequestException("Bitte bewerten Sie jede Aussage");
      }
      if (scaleValues.some((optionIndex) => !config.options?.[optionIndex])) {
        throw new BadRequestException("Eine Skalenbewertung ist ungültig");
      }
      answerValue = { scaleValues };
    } else {
      if (body.optionIndex === undefined || !config.options?.[body.optionIndex]) {
        throw new BadRequestException("Ungültige Antwortoption");
      }
      answerValue = { optionIndex: body.optionIndex };
    }

    const tokenHash = this.participantTokenHash(session.id, body.participantToken);

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
          value: answerValue,
          requestId: body.requestId,
        },
        create: {
          liveSessionId: session.id,
          nodeId: body.nodeId,
          participantId: participant.id,
          requestId: body.requestId,
          value: answerValue,
        },
      });
      return tx.liveSession.update({
        where: { id: session.id },
        data: { stateVersion: { increment: 1 } },
      });
    });

    this.broadcast(session.id, updated.stateVersion, "session.results_changed");
    return this.snapshotByRoom(session.roomCode, body.participantToken);
  }

  async createGroup(roomCode: string, body: CreateGroupDto) {
    const session = await this.activeGroupSession(roomCode, body.nodeId);
    const name = body.name.trim();
    if (!name) throw new BadRequestException("Gruppenname fehlt");
    const answers = await this.prisma.answer.findMany({
      where: { liveSessionId: session.id, nodeId: body.nodeId, isHidden: false },
      select: { value: true },
    });
    const groups = new Map<string, string>();
    for (const answer of answers) {
      const value = answer.value as GroupValue;
      if (typeof value.groupId === "string" && typeof value.groupName === "string") groups.set(value.groupId, value.groupName);
    }
    const maxGroups = Math.min(20, Math.max(2, Number((session.currentNode!.config as PollConfig).maxGroups ?? 8)));
    if (groups.size >= maxGroups) throw new ConflictException("Die maximale Anzahl an Gruppen ist erreicht");
    if ([...groups.values()].some((existing) => existing.localeCompare(name, "de", { sensitivity: "base" }) === 0)) {
      throw new ConflictException("Eine Gruppe mit diesem Namen existiert bereits");
    }
    const groupId = randomUUID();
    const updated = await this.saveGroupMembership(session.id, body.nodeId, body.participantToken, body.requestId, {
      groupId,
      groupName: name,
      result: "",
    });
    this.broadcast(session.id, updated.stateVersion, "session.groups_changed");
    return this.snapshotByRoom(session.roomCode, body.participantToken);
  }

  async joinGroup(roomCode: string, groupId: string, body: JoinGroupDto) {
    const session = await this.activeGroupSession(roomCode, body.nodeId);
    const answers = await this.prisma.answer.findMany({
      where: { liveSessionId: session.id, nodeId: body.nodeId, isHidden: false },
      select: { value: true },
    });
    const group = answers.map((answer) => answer.value as GroupValue).find((value) => value.groupId === groupId && typeof value.groupName === "string");
    if (!group?.groupName) throw new NotFoundException("Gruppe nicht gefunden");
    const updated = await this.saveGroupMembership(session.id, body.nodeId, body.participantToken, body.requestId, {
      groupId,
      groupName: group.groupName,
      result: "",
    });
    this.broadcast(session.id, updated.stateVersion, "session.groups_changed");
    return this.snapshotByRoom(session.roomCode, body.participantToken);
  }

  async leaveGroup(roomCode: string, body: JoinGroupDto) {
    const session = await this.activeGroupSession(roomCode, body.nodeId);
    const tokenHash = this.participantTokenHash(session.id, body.participantToken);
    const participant = await this.prisma.participantSession.findUnique({
      where: { anonymousTokenHash: tokenHash },
      select: { id: true },
    });
    if (!participant) throw new ConflictException("Sie sind keiner Gruppe beigetreten");
    const membership = await this.prisma.answer.findUnique({
      where: {
        liveSessionId_nodeId_participantId: {
          liveSessionId: session.id,
          nodeId: body.nodeId,
          participantId: participant.id,
        },
      },
      select: { id: true, value: true },
    });
    const value = membership?.value as GroupValue | undefined;
    if (!membership || typeof value?.groupId !== "string") {
      throw new ConflictException("Sie sind keiner Gruppe beigetreten");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.answer.delete({ where: { id: membership.id } });
      return tx.liveSession.update({
        where: { id: session.id },
        data: { stateVersion: { increment: 1 } },
      });
    });
    this.broadcast(session.id, updated.stateVersion, "session.groups_changed");
    return this.snapshotByRoom(session.roomCode, body.participantToken);
  }

  async submitGroupResult(roomCode: string, groupId: string, body: SubmitGroupResultDto) {
    const session = await this.activeGroupResultSession(roomCode, body.nodeId);
    const tokenHash = this.participantTokenHash(session.id, body.participantToken);
    const participant = await this.prisma.participantSession.findUnique({ where: { anonymousTokenHash: tokenHash } });
    if (!participant) throw new ConflictException("Treten Sie zuerst einer Gruppe bei");
    const config = session.currentNode!.config as PollConfig;
    const membershipNodeId = session.currentNode!.type === "GROUP_DISCUSSION" ? config.sourceGroupNodeId : body.nodeId;
    if (!membershipNodeId) throw new ConflictException("Für diese Diskussion ist keine Gruppenseite ausgewählt");
    const membership = await this.prisma.answer.findUnique({
      where: { liveSessionId_nodeId_participantId: { liveSessionId: session.id, nodeId: membershipNodeId, participantId: participant.id } },
    });
    const value = membership?.value as GroupValue | undefined;
    if (!membership || value?.groupId !== groupId || typeof value.groupName !== "string") {
      throw new ConflictException("Treten Sie zuerst dieser Gruppe bei");
    }
    const maxAnswers = Math.min(12, Math.max(0, Number(config.maxAnswers ?? 0)));
    const answers = body.answers.map((answer) => answer.trim()).filter(Boolean);
    if (maxAnswers > 0 && answers.length > maxAnswers) throw new BadRequestException(`Eine Gruppe kann höchstens ${maxAnswers} Antworten festhalten`);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.answer.upsert({
        where: { liveSessionId_nodeId_participantId: { liveSessionId: session.id, nodeId: body.nodeId, participantId: participant.id } },
        update: { value: { groupId, groupName: value.groupName, answers, result: answers.join("\n"), completed: body.completed }, requestId: body.requestId },
        create: { liveSessionId: session.id, nodeId: body.nodeId, participantId: participant.id, requestId: body.requestId, value: { groupId, groupName: value.groupName, answers, result: answers.join("\n"), completed: body.completed } },
      });
      return tx.liveSession.update({ where: { id: session.id }, data: { stateVersion: { increment: 1 } } });
    });
    this.broadcast(session.id, updated.stateVersion, "session.groups_changed");
    return this.snapshotByRoom(session.roomCode, body.participantToken);
  }

  async submitPriorityVote(roomCode: string, body: SubmitPriorityVoteDto) {
    const session = await this.activePrioritySession(roomCode, body.nodeId);
    const config = session.currentNode!.config as PollConfig;
    const maxVotes = Math.min(10, Math.max(1, Number(config.maxVotes ?? 3)));
    if (body.pointIds.length > maxVotes) throw new BadRequestException(`Sie können höchstens ${maxVotes} Stimmen vergeben`);
    const sourceAnswers = config.sourceGroupNodeId
      ? await this.prisma.answer.findMany({
          where: { liveSessionId: session.id, nodeId: config.sourceGroupNodeId, isHidden: false },
          select: { value: true, updatedAt: true },
        })
      : [];
    const validPointIds = new Set(this.priorityPoints(config.sourceGroupNodeId, sourceAnswers).map((point) => point.id));
    if (body.pointIds.some((pointId) => !validPointIds.has(pointId))) throw new BadRequestException("Ein ausgewählter Diskussionspunkt existiert nicht mehr");
    const tokenHash = this.participantTokenHash(session.id, body.participantToken);
    const updated = await this.prisma.$transaction(async (tx) => {
      const participant = await tx.participantSession.upsert({
        where: { anonymousTokenHash: tokenHash },
        update: { lastSeenAt: new Date() },
        create: { liveSessionId: session.id, anonymousTokenHash: tokenHash },
      });
      await tx.answer.upsert({
        where: { liveSessionId_nodeId_participantId: { liveSessionId: session.id, nodeId: body.nodeId, participantId: participant.id } },
        update: { value: { pointIds: body.pointIds }, requestId: body.requestId },
        create: { liveSessionId: session.id, nodeId: body.nodeId, participantId: participant.id, requestId: body.requestId, value: { pointIds: body.pointIds } },
      });
      return tx.liveSession.update({ where: { id: session.id }, data: { stateVersion: { increment: 1 } } });
    });
    this.broadcast(session.id, updated.stateVersion, "session.priority_votes_changed");
    return this.snapshotByRoom(session.roomCode, body.participantToken);
  }

  private async activeGroupSession(roomCode: string, nodeId: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { roomCode: roomCode.replace(/\s/g, "") },
      include: { currentNode: true },
    });
    if (!session) throw new NotFoundException("Raum nicht gefunden");
    if (session.status !== "LIVE" || session.interactionStatus !== "ACCEPTING") {
      throw new ConflictException("Die Gruppenphase ist derzeit geschlossen");
    }
    if (!session.currentNode || session.currentNode.id !== nodeId || session.currentNode.type !== "GROUP_PAGE") {
      throw new ConflictException("Die Gruppenseite ist nicht mehr aktuell");
    }
    return session;
  }

  private async activeGroupResultSession(roomCode: string, nodeId: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { roomCode: roomCode.replace(/\s/g, "") },
      include: { currentNode: true },
    });
    if (!session) throw new NotFoundException("Raum nicht gefunden");
    if (session.status !== "LIVE" || session.interactionStatus !== "ACCEPTING") {
      throw new ConflictException("Die Gruppendiskussion ist derzeit geschlossen");
    }
    if (!session.currentNode || session.currentNode.id !== nodeId || (session.currentNode.type !== "GROUP_DISCUSSION" && session.currentNode.type !== "GROUP_PAGE")) {
      throw new ConflictException("Die Gruppendiskussion ist nicht mehr aktuell");
    }
    return session;
  }

  private async activePrioritySession(roomCode: string, nodeId: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { roomCode: roomCode.replace(/\s/g, "") },
      include: { currentNode: true },
    });
    if (!session) throw new NotFoundException("Raum nicht gefunden");
    if (session.status !== "LIVE" || session.interactionStatus !== "ACCEPTING") throw new ConflictException("Die Priorisierung ist derzeit geschlossen");
    if (!session.currentNode || session.currentNode.id !== nodeId || session.currentNode.type !== "PRIORITY_VOTE") throw new ConflictException("Die Priorisierung ist nicht mehr aktuell");
    return session;
  }

  private priorityPoints(sourceNodeId: string | null | undefined, answers: Array<{ nodeId?: string; value: Prisma.JsonValue; updatedAt: Date }>): PriorityPoint[] {
    return buildPriorityPoints(sourceNodeId, answers);
  }

  private async saveGroupMembership(sessionId: string, nodeId: string, participantToken: string, requestId: string, value: { groupId: string; groupName: string; result: string }) {
    const tokenHash = this.participantTokenHash(sessionId, participantToken);
    return this.prisma.$transaction(async (tx) => {
      const participant = await tx.participantSession.upsert({
        where: { anonymousTokenHash: tokenHash },
        update: { lastSeenAt: new Date() },
        create: { liveSessionId: sessionId, anonymousTokenHash: tokenHash },
      });
      await tx.answer.upsert({
        where: { liveSessionId_nodeId_participantId: { liveSessionId: sessionId, nodeId, participantId: participant.id } },
        update: { value, requestId },
        create: { liveSessionId: sessionId, nodeId, participantId: participant.id, requestId, value },
      });
      return tx.liveSession.update({ where: { id: sessionId }, data: { stateVersion: { increment: 1 } } });
    });
  }

  private participantTokenHash(sessionId: string, participantToken: string) {
    return createHash("sha256").update(`${sessionId}:${participantToken}`).digest("hex");
  }

  async update(id: string, body: UpdateSessionDto) {
    if (
      body.interactionStatus === undefined &&
      body.resultsVisible === undefined &&
      body.currentNodeId === undefined &&
      body.timerAction === undefined &&
      body.activeGroupIndex === undefined
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
    if (body.activeGroupIndex !== undefined) {
      const session = await this.prisma.liveSession.findUnique({ where: { id }, include: { currentNode: true } });
      if (!session) throw new NotFoundException("Sitzung nicht gefunden");
      if (session.currentNode?.type !== "GROUP_PRESENTATION") throw new BadRequestException("Gruppen können nur auf der Ergebnisseite gewechselt werden");
      data.activeGroupIndex = body.activeGroupIndex;
    }
    if (body.currentNodeId !== undefined) {
      const session = await this.prisma.liveSession.findUnique({ where: { id } });
      if (!session) throw new NotFoundException("Sitzung nicht gefunden");
      const node = await this.prisma.presentationNode.findFirst({
        where: { id: body.currentNodeId, presentationId: session.presentationId },
      });
      if (!node) throw new BadRequestException("Seite gehört nicht zu dieser Präsentation");
      data.currentNode = { connect: { id: node.id } };
      data.activeGroupIndex = 0;
      const isInteractive = node.type === "MULTIPLE_CHOICE" || node.type === "RATING" || node.type === "GROUP_PAGE" || node.type === "GROUP_DISCUSSION" || node.type === "PRIORITY_VOTE";
      data.interactionStatus = isInteractive ? "ACCEPTING" : "NOT_OPEN";
      const nodeConfig = node.config as PollConfig;
      data.resultsVisible = isInteractive && nodeConfig.resultDisplayMode === "LIVE";
      const durationSeconds = Math.min(180, Math.max(0, Number(nodeConfig.durationMinutes ?? 0))) * 60;
      if (node.type === "GROUP_DISCUSSION" && durationSeconds > 0) {
        data.timerStartedAt = new Date();
        data.timerRemainingSec = durationSeconds;
        data.timerRunning = true;
      } else {
        data.timerStartedAt = null;
        data.timerRemainingSec = null;
        data.timerRunning = false;
      }
    }
    if (body.timerAction !== undefined) {
      const session = await this.prisma.liveSession.findUnique({ where: { id }, include: { currentNode: true } });
      if (!session) throw new NotFoundException("Sitzung nicht gefunden");
      if (session.currentNode?.type !== "GROUP_DISCUSSION") throw new BadRequestException("Der Timer ist nur während einer Gruppendiskussion verfügbar");
      const config = session.currentNode.config as PollConfig;
      const configuredDuration = Math.min(180, Math.max(0, Number(config.durationMinutes ?? 0))) * 60;
      if (configuredDuration === 0) throw new BadRequestException("Für diese Gruppendiskussion ist kein Zeitlimit eingestellt");
      const timer = this.discussionTimer(session);
      if (body.timerAction === "PAUSE") {
        data.timerStartedAt = null;
        data.timerRemainingSec = timer.remainingSeconds;
        data.timerRunning = false;
      } else if (body.timerAction === "RESET") {
        data.timerStartedAt = null;
        data.timerRemainingSec = configuredDuration;
        data.timerRunning = false;
      } else if (body.timerAction === "ADD_MINUTE") {
        data.timerRemainingSec = timer.remainingSeconds + 60;
        data.timerStartedAt = session.timerRunning ? new Date() : null;
      } else {
        data.timerStartedAt = new Date();
        data.timerRemainingSec = timer.remainingSeconds > 0
          ? timer.remainingSeconds
          : configuredDuration;
        data.timerRunning = true;
      }
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

  private groupAnswers(value: GroupValue) {
    if (Array.isArray(value.answers)) {
      return value.answers.filter((answer): answer is string => typeof answer === "string").map((answer) => answer.trim()).filter(Boolean);
    }
    if (typeof value.result !== "string") return [];
    return value.result.split(/\r?\n/).map((answer) => answer.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean);
  }

  private discussionTimer(session: { timerStartedAt: Date | null; timerRemainingSec: number | null; timerRunning: boolean }) {
    const base = Math.max(0, session.timerRemainingSec ?? 0);
    const elapsed = session.timerRunning && session.timerStartedAt
      ? Math.floor((Date.now() - session.timerStartedAt.getTime()) / 1000)
      : 0;
    const remainingSeconds = Math.max(0, base - elapsed);
    return {
      running: session.timerRunning && remainingSeconds > 0,
      remainingSeconds,
      endsAt: session.timerRunning && remainingSeconds > 0 ? new Date(Date.now() + remainingSeconds * 1000).toISOString() : null,
    };
  }
}
