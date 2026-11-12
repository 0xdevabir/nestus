'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ServerStatus } from '@nestus/shared';
import { Plus, Server } from 'lucide-react';
import { AddServerDialog } from '@/components/infrastructure/add-server-dialog';
import { formatRelative } from '@/components/infrastructure/format';
import {
  StatusDot,
  statusBadgeClass,
} from '@/components/infrastructure/status-dot';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePermission } from '@/hooks/use-permission';
import { listServers } from '@/lib/servers-api';
import { useOrg } from '@/providers/org-provider';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  ...Object.values(ServerStatus).map((s) => ({ value: s, label: s })),
];

export default function InfrastructurePage() {
  const { org, orgSlug } = useOrg();
  const canRead = usePermission('server:read');
  const canWrite = usePermission('server:write');
  const [status, setStatus] = useState('all');
  const [tag, setTag] = useState('');

  const filters = useMemo(
    () => ({
      status: status === 'all' ? undefined : status,
      tag: tag.trim() || undefined,
      limit: 100,
    }),
    [status, tag],
  );

  const serversQuery = useQuery({
    queryKey: ['servers', org?.id, filters],
    queryFn: () => listServers(org!.id, filters),
    enabled: Boolean(org?.id) && canRead,
    refetchInterval: 15_000,
  });

  const servers = serversQuery.data?.data ?? [];
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const s of servers) {
      for (const t of s.tags ?? []) set.add(t);
    }
    return Array.from(set).sort();
  }, [servers]);

  if (!canRead) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Infrastructure</h1>
        <p className="text-sm text-muted-foreground">
          You need the <code className="font-mono text-xs">server:read</code> permission.
        </p>
      </div>
    );
  }

  const empty =
    !serversQuery.isLoading &&
    servers.length === 0 &&
    status === 'all' &&
    !tag.trim();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-1 flex size-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
            <Server className="size-4" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Infrastructure</h1>
            <p className="text-sm text-muted-foreground">
              Servers enrolled via the Nestus agent.
            </p>
          </div>
        </div>
        {canWrite && org ? <AddServerDialog orgId={org.id} /> : null}
      </div>

      {empty ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border/60 bg-card/30 px-6 text-center">
          <div className="flex size-14 items-center justify-center rounded-xl border border-border/60 bg-card/60 text-primary shadow-[0_0_40px_-12px_oklch(0.78_0.14_210/0.5)]">
            <Server className="size-6" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold tracking-tight">No servers yet</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Add a server to get an install command. Once the agent enrolls, it will show
              ONLINE with host facts and containers.
            </p>
          </div>
          {canWrite && org ? (
            <AddServerDialog
              orgId={org.id}
              trigger={
                <Button>
                  <Plus className="size-4" />
                  Add server
                </Button>
              }
            />
          ) : null}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag-filter">Tag</Label>
              <Input
                id="tag-filter"
                className="w-[180px]"
                placeholder="Filter by tag"
                list="server-tags"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
              />
              <datalist id="server-tags">
                {allTags.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Server</TableHead>
                  <TableHead>Hostname</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>Public IP</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead>Tags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serversQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ) : servers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-sm text-muted-foreground">
                      No servers match these filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  servers.map((server) => (
                    <TableRow key={server.id} className="group">
                      <TableCell>
                        <Link
                          href={`/${orgSlug}/infrastructure/${server.id}`}
                          className="flex items-center gap-2.5 hover:text-primary"
                        >
                          <StatusDot status={server.status} />
                          <div>
                            <p className="text-sm font-medium">{server.name}</p>
                            <Badge
                              variant="outline"
                              className={cn(
                                'mt-0.5 font-mono text-[10px]',
                                statusBadgeClass(server.status),
                              )}
                            >
                              {server.status}
                            </Badge>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {server.hostname ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {server.os ?? server.platform ?? '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {server.publicIp ?? '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {server.agentVersion ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatRelative(server.lastSeenAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(server.tags ?? []).length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            server.tags.map((t) => (
                              <Badge key={t} variant="outline" className="font-mono text-[10px]">
                                {t}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
