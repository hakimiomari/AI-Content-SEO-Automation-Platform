'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerId: string;
  contentId: string;
  triggerRef: React.RefObject<HTMLElement | null>;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | null>(null);

function useDropdownMenu(component: string): DropdownMenuContextValue {
  const ctx = React.useContext(DropdownMenuContext);
  if (!ctx) throw new Error(`<${component}> must be rendered inside <DropdownMenu>`);
  return ctx;
}

export interface DropdownMenuProps {
  children: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/**
 * Lightweight popover menu: click-outside and Escape to close, roving focus with
 * arrow keys, WAI-ARIA menu roles. No portal — content is absolutely positioned
 * relative to the wrapper, which is enough for header/user menus.
 */
function DropdownMenu({
  children,
  open,
  defaultOpen = false,
  onOpenChange,
  className,
}: DropdownMenuProps) {
  const [internal, setInternal] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internal;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const baseId = React.useId();

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternal(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  React.useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, setOpen]);

  const ctx = React.useMemo<DropdownMenuContextValue>(
    () => ({
      open: isOpen,
      setOpen,
      triggerId: `${baseId}-trigger`,
      contentId: `${baseId}-content`,
      triggerRef,
    }),
    [isOpen, setOpen, baseId],
  );

  return (
    <DropdownMenuContext.Provider value={ctx}>
      <div
        ref={rootRef}
        data-slot="dropdown-menu"
        className={cn('relative inline-flex', className)}
      >
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
}

export type DropdownMenuTriggerProps = React.ComponentProps<'button'> & { asChild?: boolean };

function DropdownMenuTrigger({
  asChild = false,
  onClick,
  type,
  ...props
}: DropdownMenuTriggerProps) {
  const { open, setOpen, triggerId, contentId, triggerRef } =
    useDropdownMenu('DropdownMenuTrigger');
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={(node: HTMLElement | null) => {
        triggerRef.current = node;
      }}
      id={triggerId}
      type={asChild ? type : (type ?? 'button')}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? contentId : undefined}
      data-state={open ? 'open' : 'closed'}
      data-slot="dropdown-menu-trigger"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(!open);
      }}
      {...props}
    />
  );
}

export type DropdownMenuContentProps = React.ComponentProps<'div'> & {
  align?: 'start' | 'end';
  sideOffset?: number;
};

function DropdownMenuContent({
  className,
  align = 'end',
  sideOffset = 6,
  style,
  onKeyDown,
  children,
  ...props
}: DropdownMenuContentProps) {
  const { open, contentId, triggerId } = useDropdownMenu('DropdownMenuContent');
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const first = ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])');
    first?.focus();
  }, [open]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'),
    );
    if (items.length === 0) return;
    const index = items.findIndex((item) => item === document.activeElement);
    let next = 0;
    if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    if (event.key === 'End') next = items.length - 1;
    event.preventDefault();
    items[next]?.focus();
  };

  if (!open) return null;

  return (
    <div
      ref={ref}
      id={contentId}
      role="menu"
      aria-labelledby={triggerId}
      data-slot="dropdown-menu-content"
      onKeyDown={handleKeyDown}
      style={{ marginTop: sideOffset, ...style }}
      className={cn(
        'absolute top-full z-50 min-w-40 origin-top overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg animate-scale-in',
        align === 'end' ? 'right-0' : 'left-0',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export type DropdownMenuItemProps = React.ComponentProps<'button'> & {
  asChild?: boolean;
  inset?: boolean;
  variant?: 'default' | 'destructive';
  /** Fires on activation, before the menu closes. */
  onSelect?: () => void;
};

function DropdownMenuItem({
  asChild = false,
  inset = false,
  variant = 'default',
  className,
  onSelect,
  onClick,
  type,
  ...props
}: DropdownMenuItemProps) {
  const { setOpen } = useDropdownMenu('DropdownMenuItem');
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      role="menuitem"
      tabIndex={-1}
      type={asChild ? type : (type ?? 'button')}
      data-slot="dropdown-menu-item"
      data-variant={variant}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        onSelect?.();
        setOpen(false);
      }}
      className={cn(
        'relative flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none select-none transition-colors',
        'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
        'disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
        variant === 'destructive' &&
          'text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive [&_svg]:text-destructive',
        inset && 'pl-8',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuLabel({
  className,
  inset = false,
  ...props
}: React.ComponentProps<'div'> & { inset?: boolean }) {
  return (
    <div
      data-slot="dropdown-menu-label"
      className={cn(
        'px-2 py-1.5 text-xs font-medium text-muted-foreground',
        inset && 'pl-8',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      data-slot="dropdown-menu-separator"
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn('ml-auto text-xs tracking-widest text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
};
