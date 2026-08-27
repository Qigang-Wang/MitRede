ALTER TABLE "LiveSession"
ADD COLUMN "timerStartedAt" TIMESTAMP(3),
ADD COLUMN "timerRemainingSec" INTEGER,
ADD COLUMN "timerRunning" BOOLEAN NOT NULL DEFAULT false;
