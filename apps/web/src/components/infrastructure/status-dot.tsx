import { ServerStatus } from '@nestus/shared';
import { cn } from '@/lib/utils';

const STATUS_DOT: Record<ServerStatus, string> = {
  [ServerStatus.ONLINE]: 'bg-ok',
  [ServerStatus.PENDING]: 'bg-warn',
  [ServerStatus.DEGRADED]: 'bg-warn',
  [ServerStatus.OFFLINE]: 'bg-crit',
};

export function StatusDot({
  status,
  className,
}: {
  status: ServerStatus | string;
  className?: string;
}) {
  const color = STATUS_DOT[status as ServerStatus] ?? 'bg-muted-foreground';
  const pulse = status === ServerStatus.ONLINE;

  return (
    <span
      className={cn(
        'inline-flex size-2.5 shrink-0 rounded-full',
        color,
        pulse && 'animate-pulse shadow-[0_0_8px_var(--ok)]',
        className,
      )}
      title={status}
      aria-label={status}
    />
  );
}

export function statusBadgeClass(status: ServerStatus | string) {
  switch (status) {
    case ServerStatus.ONLINE:
      return 'border-ok/40 bg-ok/10 text-ok';
    case ServerStatus.PENDING:
    case ServerStatus.DEGRADED:
      return 'border-warn/40 bg-warn/10 text-warn';
    case ServerStatus.OFFLINE:
      return 'border-crit/40 bg-crit/10 text-crit';
    default:
      return 'border-border text-muted-foreground';
  }
}

export function commandStatusBadgeClass(status: string) {
  switch (status) {
    case 'SUCCEEDED':
      return 'border-ok/40 bg-ok/10 text-ok';
    case 'FAILED':
    case 'REJECTED':
    case 'TIMED_OUT':
      return 'border-crit/40 bg-crit/10 text-crit';
    case 'RUNNING':
    case 'ACCEPTED':
    case 'SENT':
      return 'border-primary/40 bg-primary/10 text-primary';
    case 'QUEUED':
      return 'border-warn/40 bg-warn/10 text-warn';
    default:
      return 'border-border text-muted-foreground';
  }
}

export function containerStateBadgeClass(state: string) {
  const normalized = state.toLowerCase();
  if (normalized === 'running') return 'border-ok/40 bg-ok/10 text-ok';
  if (normalized === 'restarting' || normalized === 'paused') {
    return 'border-warn/40 bg-warn/10 text-warn';
  }
  if (
    normalized === 'exited' ||
    normalized === 'dead' ||
    normalized === 'removed'
  ) {
    return 'border-crit/40 bg-crit/10 text-crit';
  }
  return 'border-border text-muted-foreground';
}
