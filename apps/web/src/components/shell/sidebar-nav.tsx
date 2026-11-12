'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getNavGroups } from '@/lib/nav';
import { cn } from '@/lib/utils';

export function SidebarNav({
  orgSlug,
  onNavigate,
}: {
  orgSlug: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const groups = getNavGroups(orgSlug);

  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 pb-6">
      {groups.map((group) => (
        <div key={group.label} className="space-y-1">
          <p className="px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                      active
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span>{item.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function BrandMark() {
  return (
    <div className="flex items-center gap-3 px-3 py-4">
      <div className="flex size-8 items-center justify-center rounded-md border border-primary/30 bg-primary/10 font-mono text-xs font-bold text-primary">
        N
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-[0.18em]">NESTUS</p>
        <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ok">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-ok" />
          </span>
          System online
        </p>
      </div>
    </div>
  );
}
