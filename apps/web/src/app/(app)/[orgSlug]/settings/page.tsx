'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createApiKeySchema,
  createInvitationSchema,
  Role,
  updateMemberSchema,
  updateOrgSchema,
  type CreateApiKeyInput,
  type UpdateOrgInput,
} from '@nestus/shared';
import { Copy, KeyRound, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermission } from '@/hooks/use-permission';
import { ApiClientError } from '@/lib/api';
import {
  createApiKey,
  createInvitation,
  listApiKeys,
  listMembers,
  removeMember,
  revokeApiKey,
  updateMember,
  updateOrg,
} from '@/lib/auth-api';
import { useOrg } from '@/providers/org-provider';
import type { ApiKeyCreated } from '@/lib/types';

const ROLES = [Role.OWNER, Role.ADMIN, Role.OPERATOR, Role.VIEWER] as const;

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Organization, members, and API keys.</p>
      </div>
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="mt-6">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="members" className="mt-6">
          <MembersTab />
        </TabsContent>
        <TabsContent value="api-keys" className="mt-6">
          <ApiKeysTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GeneralTab() {
  const { org } = useOrg();
  const canUpdate = usePermission('org:update');
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<UpdateOrgInput>({
    resolver: zodResolver(updateOrgSchema),
    values: { name: org?.name ?? '', slug: org?.slug ?? '' },
  });

  const mutation = useMutation({
    mutationFn: (values: UpdateOrgInput) => {
      if (!org) throw new Error('Organization not loaded');
      return updateOrg(org.id, values);
    },
    onSuccess: (updated) => {
      toast.success('Organization updated');
      void queryClient.invalidateQueries({ queryKey: ['orgs'] });
      if (updated.slug !== org?.slug) router.replace(`/${updated.slug}/settings`);
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : 'Update failed');
    },
  });

  if (!org) return <Skeleton className="h-40 w-full" />;

  return (
    <form
      className="max-w-lg space-y-4 rounded-xl border border-border/60 bg-card/40 p-5"
      onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
    >
      <div className="space-y-2">
        <Label htmlFor="org-name">Name</Label>
        <Input id="org-name" disabled={!canUpdate} {...form.register('name')} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-slug">Slug</Label>
        <Input id="org-slug" disabled={!canUpdate} {...form.register('slug')} />
      </div>
      <Button type="submit" disabled={!canUpdate || mutation.isPending}>
        {mutation.isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}

function MembersTab() {
  const { org } = useOrg();
  const canInvite = usePermission('member:invite');
  const canUpdate = usePermission('member:update');
  const canRemove = usePermission('member:remove');
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);

  const membersQuery = useQuery({
    queryKey: ['members', org?.id],
    queryFn: () => listMembers(org!.id),
    enabled: Boolean(org?.id),
  });

  const inviteForm = useForm<{ email: string; role: Role }>({
    resolver: zodResolver(createInvitationSchema),
    defaultValues: { email: '', role: Role.VIEWER },
  });

  const inviteMutation = useMutation({
    mutationFn: (values: { email: string; role: Role }) => createInvitation(org!.id, values),
    onSuccess: (inv) => {
      toast.success('Invitation created', {
        description: inv.inviteUrl ?? 'Check API logs for the invite link in development.',
      });
      setInviteOpen(false);
      inviteForm.reset({ email: '', role: Role.VIEWER });
      void queryClient.invalidateQueries({ queryKey: ['members', org?.id] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : 'Invite failed');
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: Role }) =>
      updateMember(org!.id, memberId, updateMemberSchema.parse({ role })),
    onSuccess: () => {
      toast.success('Role updated');
      void queryClient.invalidateQueries({ queryKey: ['members', org?.id] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : 'Role update failed');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => removeMember(org!.id, memberId),
    onSuccess: () => {
      toast.success('Member removed');
      void queryClient.invalidateQueries({ queryKey: ['members', org?.id] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : 'Remove failed');
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">People with access to this organization.</p>
        {canInvite ? (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="size-4" />
                Invite
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite member</DialogTitle>
                <DialogDescription>
                  Sends an invite link (logged to the API console in development).
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={inviteForm.handleSubmit((values) => inviteMutation.mutate(values))}
              >
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input id="invite-email" type="email" {...inviteForm.register('email')} />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select
                    value={inviteForm.watch('role')}
                    onValueChange={(v) => inviteForm.setValue('role', v as Role)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={inviteMutation.isPending}>
                    {inviteMutation.isPending ? 'Sending…' : 'Send invite'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      <div className="rounded-xl border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {membersQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={3}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ) : (
              (membersQuery.data ?? []).map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">{m.user?.name ?? m.userId}</p>
                      <p className="font-mono text-xs text-muted-foreground">{m.user?.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {canUpdate ? (
                      <Select
                        value={m.role}
                        onValueChange={(role) =>
                          roleMutation.mutate({ memberId: m.id, role: role as Role })
                        }
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{m.role}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {canRemove ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMutation.mutate(m.id)}
                      >
                        <Trash2 className="size-4 text-muted-foreground" />
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ApiKeysTab() {
  const { org } = useOrg();
  const canRead = usePermission('apikey:read');
  const canWrite = usePermission('apikey:write');
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);

  const keysQuery = useQuery({
    queryKey: ['api-keys', org?.id],
    queryFn: () => listApiKeys(org!.id),
    enabled: Boolean(org?.id) && canRead,
  });

  const form = useForm<CreateApiKeyInput>({
    resolver: zodResolver(createApiKeySchema),
    defaultValues: { name: '' },
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateApiKeyInput) => createApiKey(org!.id, values),
    onSuccess: (key) => {
      setCreatedKey(key);
      setCreateOpen(false);
      form.reset({ name: '' });
      void queryClient.invalidateQueries({ queryKey: ['api-keys', org?.id] });
      toast.success('API key created');
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : 'Create failed');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revokeApiKey(org!.id, keyId),
    onSuccess: () => {
      toast.success('API key revoked');
      void queryClient.invalidateQueries({ queryKey: ['api-keys', org?.id] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : 'Revoke failed');
    },
  });

  if (!canRead) {
    return (
      <p className="text-sm text-muted-foreground">You do not have permission to view API keys.</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Machine credentials scoped to this organization.
        </p>
        {canWrite ? (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <KeyRound className="size-4" />
                Create key
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create API key</DialogTitle>
                <DialogDescription>
                  The plaintext key is shown only once after creation.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
              >
                <div className="space-y-2">
                  <Label htmlFor="key-name">Name</Label>
                  <Input id="key-name" {...form.register('name')} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Creating…' : 'Create'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      {createdKey ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-medium">Copy your API key now</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This is the only time the full key is shown.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md border border-border/60 bg-background px-3 py-2 font-mono text-xs">
              {createdKey.key}
            </code>
            <Button
              size="icon"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(createdKey.key);
                toast.success('Copied');
              }}
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="mt-3" onClick={() => setCreatedKey(null)}>
            Dismiss
          </Button>
        </div>
      ) : null}

      <div className="rounded-xl border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keysQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ) : (keysQuery.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-sm text-muted-foreground">
                  No API keys yet.
                </TableCell>
              </TableRow>
            ) : (
              (keysQuery.data ?? []).map((key) => (
                <TableRow key={key.id} className={key.revokedAt ? 'opacity-50' : undefined}>
                  <TableCell>{key.name}</TableCell>
                  <TableCell className="font-mono text-xs">{key.prefix}…</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {new Date(key.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {canWrite && !key.revokedAt ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => revokeMutation.mutate(key.id)}
                      >
                        <Trash2 className="size-4 text-muted-foreground" />
                      </Button>
                    ) : key.revokedAt ? (
                      <Badge variant="outline">revoked</Badge>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
