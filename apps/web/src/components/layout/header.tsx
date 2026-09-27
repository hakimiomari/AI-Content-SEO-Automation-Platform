'use client';

import Link from 'next/link';
import {
  Bell,
  Building2,
  CreditCard,
  LoaderCircle,
  LogOut,
  Menu,
  PanelLeft,
  Search,
  Settings,
  User,
} from 'lucide-react';
import { PlanBadge } from '@/components/plan-badge';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useLogout, useUser } from '@/hooks/use-user';

export interface HeaderProps {
  collapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMobileNav: () => void;
}

export function Header({ collapsed, onToggleSidebar, onOpenMobileNav }: HeaderProps) {
  const { data: user, isPending } = useUser();
  const logout = useLogout();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open navigation"
        onClick={onOpenMobileNav}
      >
        <Menu />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="hidden md:inline-flex"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-pressed={collapsed}
        onClick={onToggleSidebar}
      >
        <PanelLeft />
      </Button>

      <form
        role="search"
        className="relative hidden w-full max-w-md sm:block"
        onSubmit={(event) => event.preventDefault()}
      >
        <label htmlFor="global-search" className="sr-only">
          Search
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="global-search"
          type="search"
          placeholder="Search projects, keywords, content…"
          className="h-9 bg-muted/50 pl-9 pr-14 dark:bg-muted/30"
          autoComplete="off"
        />
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border bg-background px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground md:inline-block"
        >
          ⌘K
        </kbd>
      </form>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell />
              <span
                aria-hidden="true"
                className="absolute top-2 right-2 size-2 rounded-full bg-primary ring-2 ring-background"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              You&apos;re all caught up. Job and publishing alerts will appear here.
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-10 gap-2 px-1.5 sm:pr-3"
              aria-label="Open account menu"
            >
              {isPending ? (
                <Skeleton className="size-8 rounded-full" />
              ) : (
                <Avatar size="sm" name={user?.name} src={user?.avatarUrl} className="size-8" />
              )}
              <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">
                {isPending ? <Skeleton className="h-3.5 w-20" /> : (user?.name ?? 'Account')}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <div className="flex items-start gap-3 px-2 py-2">
              <Avatar name={user?.name} src={user?.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user?.name ?? '—'}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email ?? ''}</p>
              </div>
            </div>
            {user?.company ? (
              <div className="mx-2 mb-1 flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2.5 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate text-xs font-medium">{user.company.name}</span>
                </div>
                <PlanBadge plan={user.company.plan} />
              </div>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <User />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings?tab=company">
                <Settings />
                Company settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings?tab=billing">
                <CreditCard />
                Billing &amp; plan
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={logout.isPending}
              onSelect={() => logout.mutate()}
            >
              {logout.isPending ? <LoaderCircle className="animate-spin" /> : <LogOut />}
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
