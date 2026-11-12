'use client';

import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiClientError } from '@/lib/api';
import { acceptInvitation } from '@/lib/auth-api';
import { useAuthStore } from '@/stores/auth-store';

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [submitting, setSubmitting] = useState(false);

  async function onAccept() {
    setSubmitting(true);
    try {
      const membership = await acceptInvitation(token);
      const slug = membership.org?.slug;
      if (!slug) throw new Error('Invitation accepted but organization slug is missing');
      toast.success('Invitation accepted');
      router.replace(`/${slug}/overview`);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to accept invitation');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 font-semibold tracking-[0.28em] text-primary">
        NESTUS
      </Link>
      <Card className="w-full max-w-md border-border/60 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle>Accept invitation</CardTitle>
          <CardDescription>
            {user
              ? `Signed in as ${user.email}. Join the organization to continue.`
              : 'Sign in or register with the invited email, then accept.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {user ? (
            <Button className="w-full" disabled={submitting} onClick={() => void onAccept()}>
              {submitting ? 'Accepting…' : 'Accept invitation'}
            </Button>
          ) : (
            <>
              <Button asChild className="w-full">
                <Link href={`/login?next=/invite/${token}`}>Sign in to accept</Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href={`/register?next=/invite/${token}`}>Create account</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
