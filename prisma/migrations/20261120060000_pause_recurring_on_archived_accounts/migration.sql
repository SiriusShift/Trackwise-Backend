-- Accounts archived before archiving paused their recurring items still have
-- them ACTIVE, so the cron keeps failing on (or posting into) those accounts.
-- Pause them now, the same as archiving does.
UPDATE "RecurringTransaction" AS r
SET "status" = 'PAUSED', "updatedAt" = NOW()
WHERE r."isActive" = true
  AND r."status" = 'ACTIVE'
  AND EXISTS (
    SELECT 1
    FROM "Asset" AS a
    WHERE a."isActive" = false
      AND (a."id" = r."fromAssetId" OR a."id" = r."toAssetId")
  );
