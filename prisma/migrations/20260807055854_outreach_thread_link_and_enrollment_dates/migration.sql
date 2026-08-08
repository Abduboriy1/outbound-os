-- AlterTable
ALTER TABLE "email_messages" ADD COLUMN     "replyPayload" JSONB;

-- AlterTable
ALTER TABLE "outreach_drafts" ADD COLUMN     "threadId" TEXT;

-- AlterTable
ALTER TABLE "sequence_enrollments" ADD COLUMN     "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "pausedAt" TIMESTAMP(3);
