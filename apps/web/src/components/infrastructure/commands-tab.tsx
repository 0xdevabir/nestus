'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { commandStatusBadgeClass } from '@/components/infrastructure/status-dot';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listCommands } from '@/lib/servers-api';
import { cn } from '@/lib/utils';

function formatDuration(ms?: number | null) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatJson(value: unknown) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function CommandsTab({ serverId }: { serverId: string }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const commandsQuery = useQuery({
    queryKey: ['commands', serverId],
    queryFn: () => listCommands(serverId, { limit: 50 }),
    refetchInterval: 8_000,
  });

  const rows = commandsQuery.data?.data ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Recent agent commands for this server. Expand a row for output or error.
      </p>
      <div className="rounded-xl border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Type</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Queued</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {commandsQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-sm text-muted-foreground">
                  No commands yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((cmd) => {
                const open = Boolean(expanded[cmd.id]);
                const output = formatJson(cmd.output);
                const hasDetail = Boolean(output || cmd.error);
                return (
                  <>
                    <TableRow key={cmd.id}>
                      <TableCell>
                        {hasDetail ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() =>
                              setExpanded((prev) => ({ ...prev, [cmd.id]: !prev[cmd.id] }))
                            }
                          >
                            {open ? (
                              <ChevronDown className="size-3.5" />
                            ) : (
                              <ChevronRight className="size-3.5" />
                            )}
                          </Button>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{cmd.type}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="font-mono">{cmd.actorType}</span>
                        {cmd.actorId ? (
                          <span className="ml-1 opacity-70">{cmd.actorId.slice(0, 8)}…</span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            'font-mono text-[10px]',
                            commandStatusBadgeClass(cmd.status),
                          )}
                        >
                          {cmd.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {formatDuration(cmd.durationMs)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {new Date(cmd.queuedAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                    {open && hasDetail ? (
                      <TableRow key={`${cmd.id}-detail`}>
                        <TableCell colSpan={6} className="bg-card/40">
                          <div className="space-y-3 px-2 py-2">
                            {cmd.error ? (
                              <div>
                                <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-crit">
                                  Error
                                </p>
                                <pre className="overflow-x-auto rounded-md border border-crit/30 bg-background px-3 py-2 font-mono text-xs text-crit whitespace-pre-wrap">
                                  {cmd.error}
                                </pre>
                              </div>
                            ) : null}
                            {output ? (
                              <div>
                                <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                  Output
                                </p>
                                <pre className="max-h-64 overflow-auto rounded-md border border-border/60 bg-background px-3 py-2 font-mono text-xs whitespace-pre-wrap">
                                  {output}
                                </pre>
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
