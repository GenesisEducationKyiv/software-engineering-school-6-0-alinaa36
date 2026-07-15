-- CreateTable
CREATE TABLE "SagaInstance" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'STARTED',
    "payload" JSONB NOT NULL,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SagaInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SagaInstance_state_idx" ON "SagaInstance"("state");
