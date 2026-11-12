'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { getNavGroups } from '@/lib/nav';

export function CommandPalette({
  orgSlug,
  open: controlledOpen,
  onOpenChange,
}: {
  orgSlug: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const router = useRouter();
  const groups = getNavGroups(orgSlug);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Jump to a page…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.items.map((item) => (
              <CommandItem
                key={item.href}
                value={`${group.label} ${item.title}`}
                onSelect={() => {
                  setOpen(false);
                  router.push(item.href);
                }}
              >
                <item.icon className="mr-2 size-4" />
                {item.title}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

export function CommandPaletteTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hidden h-8 items-center gap-2 rounded-md border border-border/70 bg-background/60 px-3 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground md:inline-flex"
    >
      <span>Search</span>
      <kbd className="rounded border border-border bg-muted px-1.5 font-mono text-[10px]">⌘K</kbd>
    </button>
  );
}
