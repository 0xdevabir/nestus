'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, RotateCcw, Square } from 'lucide-react';
import { toast } from 'sonner';
import { containerStateBadgeClass } from '@/components/infrastructure/status-dot';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { ApiClientError } from '@/lib/api';
import {
  containerAction,
  listContainers,
  type ContainerAction,
} from '@/lib/servers-api';
import type { Container } from '@/lib/types';
import { cn } from '@/lib/utils';

type PendingAction = {
  container: Container;
  action: ContainerAction;
};

export function ContainersTab({ serverId }: { serverId: string }) {
  const canCommand = usePermission('server:command');
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingAction | null>(null);

  const containersQuery = useQuery({
    queryKey: ['containers', serverId],
    queryFn: () => listContainers(serverId),
    refetchInterval: 10_000,
  });

  const actionMutation = useMutation({
    mutationFn: ({ container, action }: PendingAction) =>
      containerAction(serverId, container.dockerId, action),
    onSuccess: (cmd, vars) => {
      setPending(null);
      void queryClient.invalidateQueries({ queryKey: ['containers', serverId] });
      void queryClient.invalidateQueries({ queryKey: ['commands', serverId] });
      const label = `${vars.action} ${vars.container.name}`;
      if (cmd.status === 'SUCCEEDED') {
        toast.success(`Command ${label}`, { description: cmd.status });
      } else if (cmd.status === 'FAILED' || cmd.status === 'REJECTED' || cmd.status === 'TIMED_OUT') {
        toast.error(`Command ${label}`, {
          description: cmd.error ?? cmd.status,
        });
      } else {
        toast.message(`Command ${label}`, { description: cmd.status });
      }
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : 'Command failed');
    },
  });

  const rows = containersQuery.data ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Containers reported by the agent. Refreshes about every 10s.
      </p>
      <div className="rounded-xl border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Image</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>Restarts</TableHead>
              <TableHead>Ports</TableHead>
              <TableHead className="w-[140px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {containersQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-sm text-muted-foreground">
                  No containers reported yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">
                    {c.image}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn('font-mono text-[10px]', containerStateBadgeClass(c.state))}
                    >
                      {c.state}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.health ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{c.restartCount}</TableCell>
                  <TableCell className="max-w-[180px] truncate font-mono text-xs text-muted-foreground">
                    {(c.ports ?? []).length ? c.ports.join(', ') : '—'}
                  </TableCell>
                  <TableCell>
                    {canCommand ? (
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Start"
                          disabled={c.state === 'running'}
                          onClick={() => setPending({ container: c, action: 'start' })}
                        >
                          <Play className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Stop"
                          disabled={c.state !== 'running' && c.state !== 'restarting'}
                          onClick={() => setPending({ container: c, action: 'stop' })}
                        >
                          <Square className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Restart"
                          onClick={() => setPending({ container: c, action: 'restart' })}
                        >
                          <RotateCcw className="size-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(pending)} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">
              {pending?.action} container?
            </DialogTitle>
            <DialogDescription>
              This will send <code className="font-mono text-xs">docker.{pending?.action}</code>{' '}
              for <span className="font-medium text-foreground">{pending?.container.name}</span> to
              the agent.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              disabled={actionMutation.isPending || !pending}
              onClick={() => pending && actionMutation.mutate(pending)}
            >
              {actionMutation.isPending ? 'Sending…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
