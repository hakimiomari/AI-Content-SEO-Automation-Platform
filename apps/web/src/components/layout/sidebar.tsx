'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { UsageMeter } from '@/components/dashboard/usage-meter';
import { Logo } from '@/components/layout/logo';
import { PlanBadge } from '@/components/plan-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompanyUsage } from '@/hooks/use-company';
import { useUser } from '@/hooks/use-user';
import { NAV_ITEMS, type NavItem } from '@/lib/constants';
import { cn } from '@/lib/utils';

export const SIDEBAR_WIDTH = 260;
export const SIDEBAR_WIDTH_COLLAPSED = 72;

export interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Desktop: sticky rail that springs between 260px and 72px (icons only).
 * Mobile: off-canvas drawer with backdrop, closed on navigation.
 */
export function Sidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onMobileOpenChange,
}: SidebarProps) {
  const pathname = usePathname();
  const { data: user } = useUser();
  const role = user?.role;

  const items = React.useMemo(
    () => NAV_ITEMS.filter((item) => !item.roles || (role ? item.roles.includes(role) : false)),
    [role],
  );

  return (
    <>
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH }}
        transition={{ type: 'spring', stiffness: 320, damping: 32, mass: 0.8 }}
        data-collapsed={collapsed}
        aria-label="Sidebar"
        className="sticky top-0 z-20 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex"
      >
        <SidebarBody
          items={items}
          pathname={pathname}
          collapsed={collapsed}
          onToggleCollapsed={onToggleCollapsed}
          instance="desktop"
        />
      </motion.aside>

      <AnimatePresence>
        {mobileOpen ? (
          <React.Fragment key="mobile-nav">
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] md:hidden"
              onClick={() => onMobileOpenChange(false)}
              aria-hidden="true"
            />
            <motion.aside
              key="drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 36 }}
              className="fixed inset-y-0 left-0 z-50 flex w-[18rem] max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl md:hidden"
            >
              <SidebarBody
                items={items}
                pathname={pathname}
                collapsed={false}
                onNavigate={() => onMobileOpenChange(false)}
                onClose={() => onMobileOpenChange(false)}
                instance="mobile"
              />
            </motion.aside>
          </React.Fragment>
        ) : null}
      </AnimatePresence>
    </>
  );
}

interface SidebarBodyProps {
  items: readonly NavItem[];
  pathname: string;
  collapsed: boolean;
  instance: 'desktop' | 'mobile';
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
  onClose?: () => void;
}

function SidebarBody({
  items,
  pathname,
  collapsed,
  instance,
  onToggleCollapsed,
  onNavigate,
  onClose,
}: SidebarBodyProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={cn(
          'flex h-16 shrink-0 items-center border-b border-sidebar-border px-4',
          collapsed && 'justify-center px-0',
        )}
      >
        <Logo href="/dashboard" compact={collapsed} className="min-w-0" />
        {onClose ? (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <X />
          </Button>
        ) : null}
      </div>

      <nav aria-label="Primary" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.href}>
              <SidebarLink
                item={item}
                active={isActive(pathname, item.href)}
                collapsed={collapsed}
                instance={instance}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-3">
        {collapsed ? null : <SidebarUsage />}
        {onToggleCollapsed ? (
          <Button
            variant="ghost"
            size={collapsed ? 'icon' : 'sm'}
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              collapsed ? 'mx-auto flex' : 'mt-2 w-full justify-start',
            )}
          >
            {collapsed ? (
              <ChevronsRight />
            ) : (
              <>
                <ChevronsLeft />
                Collapse
              </>
            )}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

interface SidebarLinkProps {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  instance: 'desktop' | 'mobile';
  onNavigate?: () => void;
}

function SidebarLink({ item, active, collapsed, instance, onNavigate }: SidebarLinkProps) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.title : undefined}
      className={cn(
        'group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors',
        'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/60',
        active && 'bg-sidebar-accent text-sidebar-accent-foreground',
        collapsed && 'justify-center px-0',
      )}
    >
      {active ? (
        <motion.span
          layoutId={`${instance}-sidebar-active`}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          aria-hidden="true"
          className="absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary"
        />
      ) : null}
      <Icon
        aria-hidden="true"
        className={cn(
          'size-5 shrink-0 transition-colors',
          active
            ? 'text-primary'
            : 'text-sidebar-foreground/55 group-hover:text-sidebar-accent-foreground',
        )}
      />
      <span className={cn('truncate', collapsed && 'sr-only')}>{item.title}</span>
    </Link>
  );
}

function SidebarUsage() {
  const { data, isPending, isError } = useCompanyUsage();

  if (isPending) return <Skeleton className="h-[6.5rem] w-full rounded-xl" />;
  if (isError || !data) return null;

  return (
    <div className="rounded-xl border border-sidebar-border bg-background/70 p-3 dark:bg-background/40">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium">This period</span>
        <PlanBadge plan={data.plan} />
      </div>
      <UsageMeter
        label="AI credits"
        used={data.used.aiCredits}
        limit={data.limits.aiCreditsPerMonth}
      />
      <Button asChild size="sm" variant="outline" className="mt-3 w-full">
        <Link href="/settings?tab=billing">Upgrade plan</Link>
      </Button>
    </div>
  );
}
