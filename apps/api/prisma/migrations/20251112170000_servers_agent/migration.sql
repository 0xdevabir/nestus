-- CreateEnum
CREATE TYPE "ServerStatus" AS ENUM ('PENDING', 'ONLINE', 'OFFLINE', 'DEGRADED');

-- CreateEnum
CREATE TYPE "CommandStatus" AS ENUM ('QUEUED', 'SENT', 'ACCEPTED', 'REJECTED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT');

-- CreateTable
CREATE TABLE "Server" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ServerStatus" NOT NULL DEFAULT 'PENDING',
    "hostname" TEXT,
    "os" TEXT,
    "platform" TEXT,
    "kernel" TEXT,
    "arch" TEXT,
    "cpuCores" INTEGER,
    "cpuModel" TEXT,
    "memTotalBytes" BIGINT,
    "diskTotalBytes" BIGINT,
    "publicIp" TEXT,
    "privateIps" TEXT[],
    "dockerVersion" TEXT,
    "agentVersion" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'docker',
    "tags" TEXT[],
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerAgent" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "machineId" TEXT,
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "gatewayInstance" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentToken" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrollmentToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Container" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "dockerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "health" TEXT,
    "restartCount" INTEGER NOT NULL DEFAULT 0,
    "labels" JSONB NOT NULL,
    "ports" TEXT[],
    "appId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Container_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentCommand" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "status" "CommandStatus" NOT NULL DEFAULT 'QUEUED',
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "error" TEXT,
    "output" JSONB,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,

    CONSTRAINT "AgentCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Server_orgId_idx" ON "Server"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerAgent_serverId_key" ON "ServerAgent"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentToken_tokenHash_key" ON "EnrollmentToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EnrollmentToken_orgId_idx" ON "EnrollmentToken"("orgId");

-- CreateIndex
CREATE INDEX "Container_serverId_idx" ON "Container"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "Container_serverId_dockerId_key" ON "Container"("serverId", "dockerId");

-- CreateIndex
CREATE INDEX "AgentCommand_serverId_queuedAt_idx" ON "AgentCommand"("serverId", "queuedAt");

-- CreateIndex
CREATE INDEX "AgentCommand_orgId_queuedAt_idx" ON "AgentCommand"("orgId", "queuedAt");

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerAgent" ADD CONSTRAINT "ServerAgent_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentToken" ADD CONSTRAINT "EnrollmentToken_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Container" ADD CONSTRAINT "Container_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCommand" ADD CONSTRAINT "AgentCommand_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
