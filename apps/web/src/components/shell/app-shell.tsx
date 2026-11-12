'use client';

import { useState } from 'react';
import { Menu, Siren } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { BrandMark, SidebarNav } from '@/components/shell/sidebar-nav';
import { OrgSwitcher } from '@/components/shell/org-switcher';
import { CommandPalette, CommandPaletteTrigger } from '@/components/shell/command-palette';
import { UserMenu } from '@/components/shell/user-menu';
import { useOrg } from '@/providers/org-provider';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { orgSlug } = useOrg();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <BrandMark />
        <Separator className="opacity-50" />
        <SidebarNav orgSlug={orgSlug} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/80 px-3 backdrop-blur-md sm:px-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="size-4" />
                <span className="sr-only">Open navigation</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-0">
              <BrandMark />
              <Separator className="opacity-50" />
              <SidebarNav orgSlug={orgSlug} onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <OrgSwitcher />

          <div className="ml-auto flex items-center gap-2">
            <CommandPaletteTrigger onClick={() => setCmdOpen(true)} />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-border/70 text-muted-foreground"
              disabled
              title="Incidents arrive in Phase 8"
            >
              <Siren className="size-3.5" />
              <span className="hidden sm:inline">0 open</span>
            </Button>
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>

      <CommandPalette orgSlug={orgSlug} open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
