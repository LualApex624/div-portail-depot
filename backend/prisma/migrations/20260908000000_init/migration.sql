-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'COMPLETE', 'EXPIRED', 'LOCKED');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "idHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "failedPinAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepositRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadedFile" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositSession" (
    "id" TEXT NOT NULL,
    "idHash" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "requestId" TEXT,
    "userId" TEXT,
    "ipHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "result" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_idHash_key" ON "AuthSession"("idHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DepositRequest_tokenHash_key" ON "DepositRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "DepositRequest_userId_createdAt_idx" ON "DepositRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DepositRequest_expiresAt_idx" ON "DepositRequest"("expiresAt");

-- CreateIndex
CREATE INDEX "UploadedFile_requestId_idx" ON "UploadedFile"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "DepositSession_idHash_key" ON "DepositSession"("idHash");

-- CreateIndex
CREATE INDEX "DepositSession_requestId_idx" ON "DepositSession"("requestId");

-- CreateIndex
CREATE INDEX "DepositSession_expiresAt_idx" ON "DepositSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositRequest" ADD CONSTRAINT "DepositRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DepositRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositSession" ADD CONSTRAINT "DepositSession_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DepositRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
