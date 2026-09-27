import * as React from 'react';
import Link from 'next/link';
import { APP_NAME } from '@/lib/constants';
import { cn } from '@/lib/utils';

/** Gradient tile with a stylised "A" + spark. Pure CSS gradient, so no SVG id clashes. */
export function LogoMark({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-lg bg-brand-gradient text-white shadow-sm shadow-primary/30',
        className,
      )}
      {...props}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[62%]" role="img">
        <path
          d="M5.5 18 12 5l6.5 13"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M8.6 14.2h6.8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="18.6" cy="5.2" r="1.7" fill="currentColor" />
      </svg>
    </span>
  );
}

export interface LogoProps {
  href?: string;
  /** Hide the wordmark (collapsed sidebar). */
  compact?: boolean;
  className?: string;
  textClassName?: string;
  markClassName?: string;
}

export function Logo({
  href = '/',
  compact = false,
  className,
  textClassName,
  markClassName,
}: LogoProps) {
  return (
    <Link
      href={href}
      aria-label={`${APP_NAME} home`}
      className={cn(
        'inline-flex items-center gap-2.5 rounded-md font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        className,
      )}
    >
      <LogoMark className={markClassName} />
      {compact ? null : (
        <span className={cn('truncate text-[15px] leading-none', textClassName)}>{APP_NAME}</span>
      )}
    </Link>
  );
}
