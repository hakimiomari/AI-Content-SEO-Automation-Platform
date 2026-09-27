import type { Metadata } from 'next';
import { CallToAction } from '@/components/marketing/call-to-action';
import { Features } from '@/components/marketing/features';
import { Hero } from '@/components/marketing/hero';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { Pricing } from '@/components/marketing/pricing';
import { APP_NAME } from '@/lib/constants';

export const metadata: Metadata = {
  title: {
    absolute: `${APP_NAME} — Keyword research, AI content and publishing on autopilot`,
  },
  description:
    'Research keywords, plan SEO strategy, generate and edit articles with AI agents, repurpose for social, publish on schedule and track results — in one multi-tenant workspace.',
};

export default function LandingPage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <Features />
      <Pricing />
      <CallToAction />
    </>
  );
}
