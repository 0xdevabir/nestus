import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.78_0.14_210/0.14),transparent_50%)]"
      />
      <Link href="/" className="relative z-10 mb-8 font-semibold tracking-[0.28em] text-primary">
        NESTUS
      </Link>
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </main>
  );
}
