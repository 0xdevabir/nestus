'use client';

import type { LucideIcon } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';

export function PlaceholderPage({
  title,
  icon,
  phase,
}: {
  title: string;
  icon: LucideIcon;
  phase: number;
}) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <EmptyState
        icon={icon}
        title={title}
        phase={phase}
        className="min-h-[50vh] rounded-xl border border-dashed border-border/60 bg-card/30"
      />
    </div>
  );
}
