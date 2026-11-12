'use client';

import { ChevronsUpDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOrg } from '@/providers/org-provider';

export function OrgSwitcher() {
  const router = useRouter();
  const { org, orgs, orgSlug } = useOrg();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-[160px] justify-between gap-2">
          <span className="truncate font-medium">{org?.name ?? orgSlug}</span>
          <ChevronsUpDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider">
          Organizations
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {orgs.map((o) => (
          <DropdownMenuItem
            key={o.id}
            onClick={() => router.push(`/${o.slug}/overview`)}
            className={o.slug === orgSlug ? 'bg-accent/20' : undefined}
          >
            <div className="min-w-0">
              <p className="truncate text-sm">{o.name}</p>
              <p className="truncate font-mono text-[10px] text-muted-foreground">{o.slug}</p>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
