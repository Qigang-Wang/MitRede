UPDATE "PresentationNode"
SET "config" = jsonb_set(
  jsonb_set("config"::jsonb, '{durationMinutes}', '0'::jsonb, true),
  '{maxAnswers}',
  '0'::jsonb,
  true
)
WHERE "type" = 'GROUP_DISCUSSION';

UPDATE "LiveSession" AS session
SET "timerStartedAt" = NULL,
    "timerRemainingSec" = NULL,
    "timerRunning" = false
FROM "PresentationNode" AS node
WHERE session."currentNodeId" = node."id"
  AND node."type" = 'GROUP_DISCUSSION';
