import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  phase?: number;
  className?: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  phase,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center',
        className,
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-xl border border-border/60 bg-card/60 text-primary shadow-[0_0_40px_-12px_oklch(0.78_0.14_210/0.5)]">
        <Icon className="size-6" />
      </div>
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {description ?? (phase ? `Coming in Phase ${phase}` : 'Coming soon')}
        </p>
        {phase ? (
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary/80">
            Phase {phase}
          </p>
        ) : null}
      </div>
    </div>
  );
}
