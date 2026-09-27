'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Building2, CreditCard, Plug, User, Users, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ROADMAP } from '@/lib/constants';

interface SettingsTab {
  value: string;
  label: string;
  icon: LucideIcon;
  title: string;
  description: string;
  phase: string;
  items: string[];
}

const TABS: SettingsTab[] = [
  {
    value: 'profile',
    label: 'Profile',
    icon: User,
    title: 'Your profile',
    description: 'Name, avatar, password and notification preferences.',
    phase: ROADMAP.websitesProjects,
    items: ['Display name and avatar', 'Change password', 'Email notifications', 'Active sessions'],
  },
  {
    value: 'company',
    label: 'Company',
    icon: Building2,
    title: 'Company settings',
    description: 'Workspace name, default locale, timezone and brand defaults.',
    phase: ROADMAP.websitesProjects,
    items: [
      'Company name and slug',
      'Default language and timezone',
      'Brand voice defaults',
      'Danger zone',
    ],
  },
  {
    value: 'team',
    label: 'Team',
    icon: Users,
    title: 'Team members',
    description: 'Invite teammates and manage roles: admin, content manager, user.',
    phase: ROADMAP.billingAdmin,
    items: ['Invite by email', 'Role assignment', 'Pending invitations', 'Seat usage against plan'],
  },
  {
    value: 'integrations',
    label: 'Integrations',
    icon: Plug,
    title: 'Integrations',
    description: 'WordPress, Google Search Console, LinkedIn, Facebook, YouTube, Shopify, Webflow.',
    phase: ROADMAP.publishing,
    items: [
      'Connect WordPress (application password)',
      'Google Search Console OAuth',
      'Social accounts',
      'Webhook status and health',
    ],
  },
  {
    value: 'billing',
    label: 'Billing',
    icon: CreditCard,
    title: 'Billing & plan',
    description: 'Current plan, usage, invoices and upgrades.',
    phase: ROADMAP.billingAdmin,
    items: [
      'Plan comparison and upgrade',
      'Usage this period',
      'Payment method',
      'Invoice history',
    ],
  },
];

const DEFAULT_TAB = TABS[0].value;

/** Tabs synced to `?tab=` so header links (Billing, Company) deep-link correctly. */
export function SettingsTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const requested = searchParams.get('tab');
  const current = TABS.some((tab) => tab.value === requested) ? (requested as string) : DEFAULT_TAB;

  const handleChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === DEFAULT_TAB) params.delete('tab');
    else params.set('tab', value);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <Tabs value={current} onValueChange={handleChange}>
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-fit">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <TabsTrigger key={tab.value} value={tab.value} className="h-9 flex-none">
              <Icon aria-hidden="true" />
              {tab.label}
            </TabsTrigger>
          );
        })}
      </TabsList>

      {TABS.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{tab.title}</CardTitle>
                <Badge variant="secondary">{tab.phase}</Badge>
              </div>
              <CardDescription>{tab.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm font-medium">Planned controls</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {tab.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground"
                  >
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-primary/60" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  );
}
