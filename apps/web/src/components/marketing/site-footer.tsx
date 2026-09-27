import Link from 'next/link';
import { Logo } from '@/components/layout/logo';
import { APP_NAME, APP_TAGLINE, MARKETING_LINKS } from '@/lib/constants';

const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: 'Product',
    links: [...MARKETING_LINKS, { label: 'Sign in', href: '/login' }],
  },
  {
    heading: 'Workflow',
    links: [
      { label: 'Keyword research', href: '/#features' },
      { label: 'AI content agents', href: '/#features' },
      { label: 'Publishing calendar', href: '/#features' },
      { label: 'Analytics & reports', href: '/#features' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', href: '/#' },
      { label: 'Changelog', href: '/#' },
      { label: 'Privacy', href: '/#' },
      { label: 'Terms', href: '/#' },
    ],
  },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm text-muted-foreground">{APP_TAGLINE}</p>
            <p className="mt-4 text-xs text-muted-foreground">
              Multi-tenant. Role-based. Built for marketing teams and agencies.
            </p>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h3 className="text-sm font-semibold">{column.heading}</h3>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={`${column.heading}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>
            © {year} {APP_NAME}. All rights reserved.
          </p>
          <p>Phase 1 preview — dashboard modules ship in the coming phases.</p>
        </div>
      </div>
    </footer>
  );
}
