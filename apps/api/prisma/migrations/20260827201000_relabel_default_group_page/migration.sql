UPDATE "PresentationNode"
SET "config" = "config"
  || '{"question":"Finden Sie Ihre Gruppe","prompt":"Erstellen Sie eine Gruppe oder treten Sie einer bestehenden Gruppe bei.","resultPrompt":""}'::jsonb
WHERE "type" = 'GROUP_PAGE'
  AND "config"->>'question' = 'Diskutieren Sie in Kleingruppen';
