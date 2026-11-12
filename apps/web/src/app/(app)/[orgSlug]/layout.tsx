'use client';

import { use } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { OrgProvider } from '@/providers/org-provider';

export default function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);

  return (
    <OrgProvider orgSlug={orgSlug}>
      <AppShell>{children}</AppShell>
    </OrgProvider>
  );
}
