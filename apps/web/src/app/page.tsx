import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.35_0.08_210/0.35),transparent_55%),radial-gradient(ellipse_at_bottom,oklch(0.25_0.06_250/0.4),transparent_50%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:48px_48px]"
      />

      <div className="relative z-10 flex max-w-2xl flex-col items-center text-center">
        <p className="mb-4 font-mono text-xs tracking-[0.35em] text-primary uppercase">NESTUS</p>
        <h1 className="text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">NESTUS</h1>
        <p className="mt-4 text-lg text-muted-foreground sm:text-xl">
          Deploy. Observe. Understand. Recover.
        </p>
        <p className="mt-3 max-w-md text-sm text-muted-foreground/80">
          An AI-powered platform that deploys, monitors, diagnoses and heals software running on your
          own servers.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/register">Create account</Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/status">System status</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
