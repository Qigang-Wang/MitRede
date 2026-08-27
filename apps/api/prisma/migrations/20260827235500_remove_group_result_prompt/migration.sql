UPDATE "PresentationNode"
SET "config" = jsonb_set("config"::jsonb, '{resultPrompt}', '""'::jsonb, true)
WHERE "type" = 'GROUP_DISCUSSION';
