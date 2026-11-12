'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useEffect, useState, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { bootstrapSession } from '@/lib/auth-api';
import { useAuthStore } from '@/stores/auth-store';

function AuthBootstrap({ children }: { children: ReactNode }) {
  const bootstrapped = useAuthStore((s) => s.bootstrapped);

  useEffect(() => {
    void bootstrapSession();
  }, []);

  if (!bootstrapped) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-muted-foreground">
        <div className="flex items-center gap-3 font-mono text-sm">
          <span className="size-2 animate-pulse rounded-full bg-primary" />
          Restoring session…
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthBootstrap>{children}</AuthBootstrap>
          <Toaster richColors closeButton position="top-right" />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
