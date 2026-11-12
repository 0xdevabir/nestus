'use client';

import { LayoutDashboard } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { useOrg } from '@/providers/org-provider';

export default function OverviewPage() {
  const { org } = useOrg();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          {org ? `${org.name} control plane` : 'Organization dashboard'}
        </p>
      </div>
      <EmptyState
        icon={LayoutDashboard}
        title="Overview ready"
        description="Infrastructure, deployments, and incidents will surface here as later phases land."
        phase={2}
        className="min-h-[40vh] rounded-xl border border-dashed border-border/60 bg-card/30"
      />
    </div>
  );
}
