import type { HostFacts } from '@nestus/proto-ts';
import type { Prisma } from '@prisma/client';

export function factsToServerUpdate(facts: HostFacts | undefined): Prisma.ServerUpdateInput {
  if (!facts) return {};
  return {
    hostname: facts.hostname || undefined,
    os: facts.os || undefined,
    platform: facts.platform || undefined,
    kernel: facts.kernel || undefined,
    arch: facts.arch || undefined,
    cpuCores: facts.cpuCores || undefined,
    cpuModel: facts.cpuModel || undefined,
    memTotalBytes:
      facts.memTotalBytes != null && facts.memTotalBytes > 0
        ? BigInt(Math.trunc(facts.memTotalBytes))
        : undefined,
    diskTotalBytes:
      facts.diskTotalBytes != null && facts.diskTotalBytes > 0
        ? BigInt(Math.trunc(facts.diskTotalBytes))
        : undefined,
    publicIp: facts.publicIp || undefined,
    privateIps: facts.ipAddresses?.length ? facts.ipAddresses : undefined,
    dockerVersion: facts.dockerVersion || undefined,
    agentVersion: facts.agentVersion || undefined,
    mode: facts.mode || undefined,
  };
}
