'use client';

import { formatBytes } from '@/components/infrastructure/format';
import type { Server } from '@/lib/types';

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded-lg border border-border/50 bg-card/30 px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-medium break-all">{value ?? '—'}</p>
    </div>
  );
}

export function ServerOverview({ server }: { server: Server }) {
  const ips = [
    ...(server.publicIp ? [`public: ${server.publicIp}`] : []),
    ...(server.privateIps ?? []).map((ip) => `private: ${ip}`),
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Fact label="CPU model" value={server.cpuModel} />
      <Fact
        label="CPU cores"
        value={server.cpuCores != null ? String(server.cpuCores) : null}
      />
      <Fact label="RAM" value={formatBytes(server.memTotalBytes)} />
      <Fact label="Disk" value={formatBytes(server.diskTotalBytes)} />
      <Fact label="Kernel" value={server.kernel} />
      <Fact label="Architecture" value={server.arch} />
      <Fact label="OS / platform" value={[server.os, server.platform].filter(Boolean).join(' · ') || null} />
      <Fact label="Docker" value={server.dockerVersion} />
      <Fact label="Agent" value={server.agentVersion} />
      <Fact label="Mode" value={server.mode} />
      <Fact label="Hostname" value={server.hostname} />
      <Fact
        label="IP addresses"
        value={
          ips.length > 0 ? (
            <span className="font-mono text-xs leading-relaxed">
              {ips.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </span>
          ) : null
        }
      />
    </div>
  );
}
