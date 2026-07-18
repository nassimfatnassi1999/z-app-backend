UPDATE "Email" SET "status" = 'SENT' WHERE "status" IN ('sent', 'sent_internal');
UPDATE "Email" SET "status" = 'DRAFT' WHERE "status" = 'draft';
UPDATE "Email" SET "status" = 'TRASHED' WHERE "status" = 'deleted';

UPDATE "EmailDraft" SET "status" = 'SENT' WHERE "status" IN ('sent', 'sent_internal');
UPDATE "EmailDraft" SET "status" = 'DRAFT' WHERE "status" IN ('draft', 'scheduled');
UPDATE "EmailDraft" SET "status" = 'TRASHED' WHERE "status" = 'deleted';

ALTER TABLE "Email" ALTER COLUMN "status" SET DEFAULT 'SENT';
ALTER TABLE "EmailDraft" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
