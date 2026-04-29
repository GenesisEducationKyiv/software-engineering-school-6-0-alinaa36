/*
  Warnings:

  - The primary key for the `Subscription` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[confirmToken]` on the table `Subscription` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[unsubscribeToken]` on the table `Subscription` will be added. If there are existing duplicate values, this will fail.
  - The required column `confirmToken` was added to the `Subscription` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - The required column `unsubscribeToken` was added to the `Subscription` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_pkey",
ADD COLUMN     "confirmToken" TEXT NOT NULL,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "unsubscribeToken" TEXT NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Subscription_id_seq";

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_confirmToken_key" ON "Subscription"("confirmToken");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_unsubscribeToken_key" ON "Subscription"("unsubscribeToken");
