-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "PresentationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('PDF_PAGE', 'MULTIPLE_CHOICE', 'RATING', 'WORD_CLOUD', 'OPEN_QUESTION', 'AI_SUMMARY');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('DRAFT', 'LOBBY', 'LIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "InteractionStatus" AS ENUM ('NOT_OPEN', 'ACCEPTING', 'LOCKED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Presentation" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "PresentationStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Presentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresentationNode" (
    "id" TEXT NOT NULL,
    "presentationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "NodeType" NOT NULL,
    "config" JSONB NOT NULL,
    "sourcePageNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresentationNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "presentationId" TEXT NOT NULL,
    "roomCode" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'DRAFT',
    "currentNodeId" TEXT,
    "interactionStatus" "InteractionStatus" NOT NULL DEFAULT 'NOT_OPEN',
    "resultsVisible" BOOLEAN NOT NULL DEFAULT false,
    "stateVersion" INTEGER NOT NULL DEFAULT 0,
    "controllerUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipantSession" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "anonymousTokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParticipantSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Presentation_ownerId_updatedAt_idx" ON "Presentation"("ownerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PresentationNode_presentationId_position_key" ON "PresentationNode"("presentationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "LiveSession_roomCode_key" ON "LiveSession"("roomCode");

-- CreateIndex
CREATE INDEX "LiveSession_presentationId_createdAt_idx" ON "LiveSession"("presentationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipantSession_anonymousTokenHash_key" ON "ParticipantSession"("anonymousTokenHash");

-- CreateIndex
CREATE INDEX "ParticipantSession_liveSessionId_lastSeenAt_idx" ON "ParticipantSession"("liveSessionId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_requestId_key" ON "Answer"("requestId");

-- CreateIndex
CREATE INDEX "Answer_liveSessionId_nodeId_idx" ON "Answer"("liveSessionId", "nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_liveSessionId_nodeId_participantId_key" ON "Answer"("liveSessionId", "nodeId", "participantId");

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationNode" ADD CONSTRAINT "PresentationNode_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_currentNodeId_fkey" FOREIGN KEY ("currentNodeId") REFERENCES "PresentationNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_controllerUserId_fkey" FOREIGN KEY ("controllerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantSession" ADD CONSTRAINT "ParticipantSession_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "PresentationNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "ParticipantSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
