'use client';

import * as React from 'react';
import { cn, getInitials } from '@/lib/utils';

const sizeClasses = {
  sm: 'size-7 text-[11px]',
  default: 'size-9 text-sm',
  lg: 'size-12 text-base',
  xl: 'size-16 text-xl',
} as const;

export type AvatarProps = React.ComponentProps<'span'> & {
  src?: string | null;
  /** Used for the initials fallback and the image alt text. */
  name?: string | null;
  alt?: string;
  size?: keyof typeof sizeClasses;
};

/**
 * Avatar with an initials fallback. The image sits on top of the fallback and is
 * unmounted if it fails to load, so there is never an empty circle.
 */
function Avatar({ src, name, alt, size = 'default', className, ...props }: AvatarProps) {
  const [failed, setFailed] = React.useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <span
      data-slot="avatar"
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-semibold text-primary select-none',
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      <span aria-hidden={showImage}>{getInitials(name)}</span>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote hosts, sized by the wrapper
        <img
          src={src ?? undefined}
          alt={alt ?? name ?? ''}
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  );
}

export { Avatar };
