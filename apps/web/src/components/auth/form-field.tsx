import * as React from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** Rendered to the right of the label (e.g. "Forgot password?"). */
  labelAction?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * Label + control + inline error. The control must set `id`, and gets
 * `aria-describedby`/`aria-invalid` wired via the ids exported below.
 */
export function FormField({
  id,
  label,
  error,
  hint,
  labelAction,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {labelAction}
      </div>
      {children}
      {error ? (
        <p id={fieldErrorId(id)} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={fieldHintId(id)} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function fieldErrorId(id: string): string {
  return `${id}-error`;
}

export function fieldHintId(id: string): string {
  return `${id}-hint`;
}

/** aria-describedby value for a field depending on which helper text is visible. */
export function describedBy(id: string, error?: string, hint?: string): string | undefined {
  if (error) return fieldErrorId(id);
  if (hint) return fieldHintId(id);
  return undefined;
}
