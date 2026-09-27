import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CallToAction() {
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-brand-gradient px-6 py-16 text-center text-white shadow-2xl shadow-primary/30 md:px-16 md:py-20">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-grid opacity-20 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
          />
          <div
            aria-hidden="true"
            className="absolute -top-24 -right-24 size-72 rounded-full bg-white/20 blur-3xl"
          />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Ship your next 30 articles without hiring your next 3 writers.
            </h2>
            <p className="mt-4 text-base text-white/85 text-pretty sm:text-lg">
              Create a free workspace, connect a website and watch the first keyword cluster appear
              in minutes.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="w-full bg-white text-foreground hover:bg-white/90 sm:w-auto dark:bg-white dark:text-neutral-900"
              >
                <Link href="/register">
                  Create your workspace
                  <ArrowRight />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="w-full text-white hover:bg-white/15 hover:text-white sm:w-auto"
              >
                <Link href="/login">I already have an account</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
