-- CreateTable
CREATE TABLE "debug_logs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "url" TEXT,
    "status" INTEGER,
    "ok" BOOLEAN NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debug_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "debug_logs_provider_createdAt_idx" ON "debug_logs"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "debug_logs_ok_createdAt_idx" ON "debug_logs"("ok", "createdAt");
