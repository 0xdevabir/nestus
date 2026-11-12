'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { fetchHealth } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function StatusBadge({ value }: { value?: string }) {
  const ok = value === 'up' || value === 'ok' || value === 'healthy';
  return (
    <Badge
      variant="outline"
      className={ok ? 'border-ok/40 bg-ok/10 text-ok' : 'border-crit/40 bg-crit/10 text-crit'}
    >
      {value ?? 'unknown'}
    </Badge>
  );
}

export default function StatusPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 15_000,
  });

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="font-semibold tracking-[0.2em] text-primary">
            NESTUS
          </Link>
          <h1 className="mt-3 text-2xl font-semibold">System status</h1>
          <p className="text-sm text-muted-foreground">Live health from the API control plane.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          Refresh
        </Button>
      </div>

      <Card className="border-border/60 bg-card/70">
        <CardHeader>
          <CardTitle className="text-base">API /health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-6 w-56" />
              <Skeleton className="h-6 w-48" />
            </div>
          ) : error ? (
            <p className="text-sm text-crit">
              Failed to reach API: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          ) : (
            <dl className="grid gap-3 font-mono text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">status</dt>
                <dd>
                  <StatusBadge value={data?.status} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">db</dt>
                <dd>
                  <StatusBadge value={data?.db} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">redis</dt>
                <dd>
                  <StatusBadge value={data?.redis} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">version</dt>
                <dd>{data?.version ?? '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">uptime</dt>
                <dd>{typeof data?.uptime === 'number' ? `${Math.round(data.uptime)}s` : '—'}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
