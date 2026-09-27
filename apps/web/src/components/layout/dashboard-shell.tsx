'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { PageTransition } from '@/components/layout/page-transition';
import { Sidebar } from '@/components/layout/sidebar';
import { useUser } from '@/hooks/use-user';
import { SIDEBAR_STORAGE_KEY } from '@/lib/constants';

/**
 * Authenticated application frame: sidebar + header + animated content area.
 * The middleware already gates on cookie presence; this adds the client-side
 * fallback for a session the API no longer accepts (refresh failed → 401).
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { error } = useUser();

  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Restore the persisted sidebar preference after hydration.
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored !== null) setCollapsed(stored === '1');
    } catch {
      // Storage may be unavailable (private mode); keep the default.
    }
  }, []);

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Close the drawer whenever the route changes.
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Session is gone (cookies present but rejected, refresh failed) → back to login.
  React.useEffect(() => {
    if (error?.status === 401) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [error, pathname, router]);

  return (
    <div className="flex min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          collapsed={collapsed}
          onToggleSidebar={toggleCollapsed}
          onOpenMobileNav={() => setMobileOpen(true)}
        />
        <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 outline-none md:px-8 md:py-8">
          <PageTransition>
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </PageTransition>
        </main>
      </div>
    </div>
  );
}
