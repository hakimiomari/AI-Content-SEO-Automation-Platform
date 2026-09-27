import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/layout/logo';

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_75%)]"
      />
      <div
        aria-hidden="true"
        className="absolute -top-48 left-1/2 -z-10 size-[36rem] -translate-x-1/2 rounded-full bg-brand-gradient opacity-20 blur-3xl dark:opacity-25"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-56 -right-40 -z-10 size-[28rem] rounded-full bg-brand-end/20 blur-3xl"
      />

      <Logo className="mb-8" />
      <div className="w-full max-w-md animate-fade-in-up">{children}</div>
      <Link
        href="/"
        className="mt-8 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to home
      </Link>
    </div>
  );
}
