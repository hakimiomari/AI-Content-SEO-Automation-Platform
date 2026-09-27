import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 text-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
      />
      <Logo className="mb-10" />
      <p className="text-gradient text-7xl font-semibold tracking-tight">404</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">This page does not exist</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The link may be outdated, or the module it points to has not shipped yet.
      </p>
      <div className="mt-8 flex gap-2">
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft />
            Home
          </Link>
        </Button>
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
