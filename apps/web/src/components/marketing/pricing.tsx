import Link from 'next/link';
import { Check } from 'lucide-react';
import { PLAN_LIMITS, PLAN_ORDER, type Plan } from '@acsp/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn, formatCompact, formatCurrency } from '@/lib/utils';
import { SectionHeading } from './section-heading';

const TAGLINES: Record<Plan, string> = {
  FREE: 'Try the full loop on one site.',
  STARTER: 'For founders and small teams.',
  GROWTH: 'For marketing teams shipping weekly.',
  AGENCY: 'For agencies managing many brands.',
};

const FEATURED_PLAN: Plan = 'GROWTH';

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-24 border-t bg-muted/30 py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Pricing"
          title="Plans that scale from solo to agency"
          description="Every plan includes keyword research, AI drafts and the SEO analyzer. Upgrade when your content engine needs more room."
        />

        <div className="mt-14 grid items-stretch gap-6 md:grid-cols-2 xl:grid-cols-4">
          {PLAN_ORDER.map((plan) => {
            const limits = PLAN_LIMITS[plan];
            const featured = plan === FEATURED_PLAN;
            const quotas: { label: string; value: string }[] = [
              { label: 'Words / month', value: formatCompact(limits.wordsPerMonth) },
              { label: 'AI credits', value: formatCompact(limits.aiCreditsPerMonth) },
              { label: 'Keywords / month', value: formatCompact(limits.keywordsPerMonth) },
              { label: 'Social posts', value: formatCompact(limits.socialPostsPerMonth) },
              { label: 'Users', value: String(limits.users) },
              { label: 'Websites', value: String(limits.websites) },
              { label: 'Projects', value: String(limits.projects) },
              { label: 'Integrations', value: String(limits.integrations) },
            ];

            return (
              <Card
                key={plan}
                className={cn(
                  'relative flex flex-col',
                  featured &&
                    'border-primary/70 shadow-xl shadow-primary/10 ring-1 ring-primary/30',
                )}
              >
                {featured ? (
                  <Badge
                    variant="gradient"
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-3"
                  >
                    Most popular
                  </Badge>
                ) : null}
                <CardHeader>
                  <CardTitle className="text-lg">{limits.name}</CardTitle>
                  <CardDescription>{TAGLINES[plan]}</CardDescription>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-semibold tracking-tight">
                      {limits.priceUsdMonthly === 0
                        ? 'Free'
                        : formatCurrency(limits.priceUsdMonthly)}
                    </span>
                    {limits.priceUsdMonthly > 0 ? (
                      <span className="text-sm text-muted-foreground">/ month</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">forever</span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-5">
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    {quotas.map((quota) => (
                      <div key={quota.label} className="rounded-md bg-muted/60 px-2.5 py-1.5">
                        <dt className="text-[11px] text-muted-foreground">{quota.label}</dt>
                        <dd className="font-medium">{quota.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <Separator />
                  <ul className="space-y-2 text-sm">
                    {limits.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button asChild className="w-full" variant={featured ? 'gradient' : 'outline'}>
                    <Link href={`/register?plan=${plan.toLowerCase()}`}>
                      {plan === 'FREE' ? 'Start for free' : `Start with ${limits.name}`}
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Prices in USD, billed monthly. Limits reset each billing period. Need more seats or sites?{' '}
          <Link
            href="/register"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Talk to us about enterprise.
          </Link>
        </p>
      </div>
    </section>
  );
}
