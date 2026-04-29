-- CreateTable
CREATE TABLE "Subscription" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "lastSeenTag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_email_repository_key" ON "Subscription"("email", "repository");
