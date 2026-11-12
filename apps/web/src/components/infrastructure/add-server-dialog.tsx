'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { createServerSchema, ServerStatus } from '@nestus/shared';
import { Check, Copy, Plus, Server } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusDot } from '@/components/infrastructure/status-dot';
import { parseTagsInput } from '@/components/infrastructure/format';
import { ApiClientError } from '@/lib/api';
import { createServer, getServer } from '@/lib/servers-api';
import type { Server as ServerType } from '@/lib/types';

const formSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  tagsRaw: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

type AddServerDialogProps = {
  orgId: string;
  trigger?: React.ReactNode;
};

export function AddServerDialog({ orgId, trigger }: AddServerDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{
    server: ServerType;
    installCommand: string;
  } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', tagsRaw: '' },
  });

  const createMutation = useMutation({
    mutationFn: (values: FormValues) => {
      const input = createServerSchema.parse({
        name: values.name,
        tags: parseTagsInput(values.tagsRaw ?? ''),
      });
      return createServer(orgId, input);
    },
    onSuccess: (data) => {
      setCreated(data);
      form.reset({ name: '', tagsRaw: '' });
      void queryClient.invalidateQueries({ queryKey: ['servers', orgId] });
      toast.success('Server created — run the install command');
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : 'Create failed');
    },
  });

  const pollQuery = useQuery({
    queryKey: ['server-poll', created?.server.id],
    queryFn: () => getServer(created!.server.id),
    enabled: Boolean(created?.server.id) && open,
    refetchInterval: (q) =>
      q.state.data?.status === ServerStatus.ONLINE ? false : 2500,
  });

  const online =
    pollQuery.data?.status === ServerStatus.ONLINE ||
    created?.server.status === ServerStatus.ONLINE;

  useEffect(() => {
    if (!open) {
      setCreated(null);
      form.reset({ name: '', tagsRaw: '' });
    }
  }, [open, form]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="size-4" />
            Add server
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="size-4 text-primary" />
            {created ? 'Install agent' : 'Add server'}
          </DialogTitle>
          <DialogDescription>
            {created
              ? 'Run this on the host. We will detect when the agent connects.'
              : 'Create a server record and get a one-time install command.'}
          </DialogDescription>
        </DialogHeader>

        {!created ? (
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
          >
            <div className="space-y-2">
              <Label htmlFor="server-name">Name</Label>
              <Input
                id="server-name"
                placeholder="prod-edge-01"
                autoComplete="off"
                {...form.register('name')}
              />
              {form.formState.errors.name ? (
                <p className="text-xs text-crit">{form.formState.errors.name.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="server-tags">Tags</Label>
              <Input
                id="server-tags"
                placeholder="prod, edge (comma or space separated)"
                {...form.register('tagsRaw')}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating…' : 'Create & get install command'}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <StatusDot status={pollQuery.data?.status ?? created.server.status} />
              <span className="font-medium">{created.server.name}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {pollQuery.data?.status ?? created.server.status}
              </span>
            </div>

            {online ? (
              <div className="flex items-center gap-2 rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">
                <Check className="size-4" />
                Connected ✓
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Install command</Label>
                  <div className="flex items-start gap-2">
                    <pre className="max-h-40 flex-1 overflow-auto rounded-md border border-border/60 bg-background px-3 py-2 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
                      {created.installCommand}
                    </pre>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={async () => {
                        await navigator.clipboard.writeText(created.installCommand);
                        toast.success('Copied');
                      }}
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Waiting for agent… status refreshes every few seconds.
                </p>
              </>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreated(null);
                  form.reset({ name: '', tagsRaw: '' });
                }}
              >
                Add another
              </Button>
              <Button type="button" onClick={() => setOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
