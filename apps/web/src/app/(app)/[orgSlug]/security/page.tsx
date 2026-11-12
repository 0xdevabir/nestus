'use client';

import { useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Shield } from 'lucide-react';
import { format } from 'date-fns';
import { ActorType } from '@nestus/shared';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermission } from '@/hooks/use-permission';
import { listAuditLogs } from '@/lib/auth-api';
import type { AuditLog } from '@/lib/types';
import { useOrg } from '@/providers/org-provider';
import { cn } from '@/lib/utils';

const ACTOR_TYPES = Object.values(ActorType);

function actorBadgeClass(type: string) {
  switch (type) {
    case 'USER':
      return 'border-info/40 bg-info/10 text-info';
    case 'API_KEY':
      return 'border-primary/40 bg-primary/10 text-primary';
    case 'AGENT':
      return 'border-ok/40 bg-ok/10 text-ok';
    case 'AI':
      return 'border-warn/40 bg-warn/10 text-warn';
    case 'POLICY':
      return 'border-crit/40 bg-crit/10 text-crit';
    default:
      return 'border-border text-muted-foreground';
  }
}

export default function SecurityPage() {
  const { org } = useOrg();
  const canRead = usePermission('audit:read');
  const [actorType, setActorType] = useState<string>('all');
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const filters = useMemo(
    () => ({
      actorType: actorType === 'all' ? undefined : actorType,
      action: action || undefined,
      targetType: targetType || undefined,
      limit: 25,
    }),
    [action, actorType, targetType],
  );

  const query = useInfiniteQuery({
    queryKey: ['audit-logs', org?.id, filters],
    enabled: Boolean(org?.id) && canRead,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listAuditLogs(org!.id, { ...filters, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];

  if (!canRead) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
        <p className="text-sm text-muted-foreground">
          You need the <code className="font-mono text-xs">audit:read</code> permission.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="mt-1 flex size-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
          <Shield className="size-4" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
          <p className="text-sm text-muted-foreground">
            Audit trail for members, API keys, and future control-plane actions.
          </p>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-border/60 bg-card/30 p-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Actor type</Label>
          <Select value={actorType} onValueChange={setActorType}>
            <SelectTrigger>
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {ACTOR_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="action-filter">Action</Label>
          <Input
            id="action-filter"
            placeholder="e.g. member.invite"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="target-filter">Target type</Label>
          <Input
            id="target-filter"
            placeholder="e.g. Membership"
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-xl border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Time</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton className="h-10 w-full" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No audit events yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <AuditRow
                  key={row.id}
                  row={row}
                  open={Boolean(expanded[row.id])}
                  onToggle={() =>
                    setExpanded((prev) => ({ ...prev, [row.id]: !prev[row.id] }))
                  }
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {query.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AuditRow({
  row,
  open,
  onToggle,
}: {
  row: AuditLog;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>
          {open ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
          {format(new Date(row.createdAt), 'yyyy-MM-dd HH:mm:ss')}
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn(actorBadgeClass(row.actorType))}>
              {row.actorType}
            </Badge>
            <span className="text-sm">{row.actorLabel ?? row.actorId ?? '—'}</span>
          </div>
        </TableCell>
        <TableCell className="font-mono text-xs">{row.action}</TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">
          {row.targetType
            ? `${row.targetType}${row.targetId ? `:${row.targetId.slice(0, 8)}` : ''}`
            : '—'}
        </TableCell>
      </TableRow>
      {open ? (
        <TableRow>
          <TableCell colSpan={5} className="bg-muted/20">
            <pre className="max-h-64 overflow-auto rounded-md border border-border/50 bg-background/60 p-3 font-mono text-xs">
              {JSON.stringify(row.metadata ?? {}, null, 2)}
            </pre>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
