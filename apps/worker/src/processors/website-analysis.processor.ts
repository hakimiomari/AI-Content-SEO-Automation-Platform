import { AIFeature, NotificationType } from '@acsp/database';
import { QUEUES } from '@acsp/shared';
import { UnrecoverableError } from 'bullmq';
import * as cheerio from 'cheerio';
import { z } from 'zod';
import { ai, chooseModel } from '../lib/ai';
import { EntityNotFoundError } from '../lib/errors';
import { notify } from '../lib/notifications';
import { prisma, toJson } from '../lib/prisma';
import { assertWithinLimits, getSubscription } from '../lib/usage-guard';
import { EDITORIAL_RULES } from '../agents/base-agent';
import { defineProcessor } from './define-processor';
import { websiteAnalysisJobSchema } from './schemas';

const USER_AGENT =
  'Mozilla/5.0 (compatible; ACSP-Bot/1.0; +https://github.com/acsp) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 2_000_000;

export interface CrawledPage {
  url: string;
  finalUrl: string;
  statusCode: number;
  title: string | null;
  metaDescription: string | null;
  lang: string | null;
  h1: string[];
  h2: string[];
  navLinks: { text: string; href: string }[];
  ogSiteName: string | null;
  cmsHints: string[];
  hasSchemaOrg: boolean;
  textSample: string;
  wordCount: number;
}

const CMS_SIGNATURES: [string, RegExp][] = [
  ['WordPress', /wp-content|wp-includes|wp-json/i],
  ['Shopify', /cdn\.shopify\.com|shopify-section|myshopify/i],
  ['Webflow', /webflow\.(io|com)|data-wf-page/i],
  ['Wix', /wix\.com|wixstatic\.com|X-Wix/i],
  ['Squarespace', /squarespace\.com|squarespace-cdn/i],
  ['HubSpot', /hs-scripts\.com|hubspot/i],
  ['Next.js', /__NEXT_DATA__|\/_next\//i],
  ['Nuxt', /__NUXT__|\/_nuxt\//i],
  ['Gatsby', /___gatsby|gatsby-/i],
  ['Drupal', /drupal\.js|sites\/default\/files/i],
  ['Joomla', /\/media\/jui\/|joomla/i],
  ['Ghost', /ghost\.io|ghost-(sdk|url)/i],
];

export async function crawlHomepage(url: string): Promise<CrawledPage> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (response.status >= 400 && response.status < 500 && response.status !== 429) {
    throw new UnrecoverableError(`Homepage returned HTTP ${response.status} for ${url}`);
  }
  if (!response.ok) throw new Error(`Homepage returned HTTP ${response.status} for ${url}`);

  const raw = (await response.text()).slice(0, MAX_HTML_BYTES);
  const $ = cheerio.load(raw);
  $('script, style, noscript, template, svg').remove();

  const origin = new URL(response.url || url).origin;
  const clean = (s: string | undefined | null) => (s ?? '').replace(/\s+/g, ' ').trim();

  const navLinks: { text: string; href: string }[] = [];
  const seen = new Set<string>();
  $('nav a[href], header a[href], [role="navigation"] a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const text = clean($(el).text());
    if (!text || !href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) return;
    let absolute: string;
    try {
      absolute = new URL(href, origin).toString();
    } catch {
      return;
    }
    if (!absolute.startsWith(origin) || seen.has(absolute)) return;
    seen.add(absolute);
    navLinks.push({ text: text.slice(0, 80), href: absolute });
  });

  const bodyText = clean($('main').text() || $('body').text());
  const cmsHints = CMS_SIGNATURES.filter(([, re]) => re.test(raw)).map(([name]) => name);
  const generator = clean($('meta[name="generator"]').attr('content'));
  if (generator) cmsHints.push(`generator: ${generator}`);

  return {
    url,
    finalUrl: response.url || url,
    statusCode: response.status,
    title: clean($('title').first().text()) || null,
    metaDescription: clean($('meta[name="description"]').attr('content')) || null,
    lang: clean($('html').attr('lang')) || null,
    h1: $('h1')
      .map((_, el) => clean($(el).text()))
      .get()
      .filter(Boolean)
      .slice(0, 5),
    h2: $('h2')
      .map((_, el) => clean($(el).text()))
      .get()
      .filter(Boolean)
      .slice(0, 25),
    navLinks: navLinks.slice(0, 40),
    ogSiteName: clean($('meta[property="og:site_name"]').attr('content')) || null,
    cmsHints: [...new Set(cmsHints)],
    hasSchemaOrg: $('script[type="application/ld+json"]').length > 0 || /schema\.org/i.test(raw),
    textSample: bodyText.slice(0, 4_000),
    wordCount: bodyText ? bodyText.split(/\s+/).length : 0,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const analysisSchema = z.object({
  businessProfile: z.object({
    summary: z.string().max(800).catch(''),
    industry: z.string().max(120).catch(''),
    audience: z.string().max(500).catch(''),
    products: z.array(z.string().max(120)).max(50).catch([]),
    usps: z.array(z.string().max(200)).max(20).catch([]),
    competitors: z.array(z.string().max(120)).max(20).catch([]),
    tone: z.string().max(200).catch(''),
    contentGaps: z.array(z.string().max(200)).max(15).catch([]),
  }),
  brandVoice: z.string().max(1_000).catch(''),
  suggestedTopics: z.array(z.string().max(150)).max(20).catch([]),
});

/**
 * website-analysis: crawls the homepage, extracts structure + CMS hints, asks the model for a
 * business profile / brand voice / topic ideas and stores everything on the Website row.
 */
export const websiteAnalysisProcessor = defineProcessor(
  QUEUES.WEBSITE_ANALYSIS,
  websiteAnalysisJobSchema,
  async ({ payload, jobId, log }) => {
    const website = await prisma.website.findFirst({
      where: { id: payload.websiteId, companyId: payload.companyId },
      include: { company: { select: { name: true, industry: true, description: true } } },
    });
    if (!website) throw new EntityNotFoundError('Website', payload.websiteId);

    const subscription = await getSubscription(payload.companyId);
    await assertWithinLimits(payload.companyId, { aiCredits: 1 });

    log.info({ url: website.url }, 'Crawling homepage');
    const page = await crawlHomepage(website.url);
    log.info(
      { title: page.title, cms: page.cmsHints, navLinks: page.navLinks.length },
      'Homepage crawled',
    );

    const completion = await ai.complete<unknown>({
      feature: AIFeature.WEBSITE_ANALYSIS,
      companyId: payload.companyId,
      userId: payload.userId,
      jobId,
      model: chooseModel(subscription.plan),
      json: true,
      temperature: 0.3,
      maxTokens: 2_500,
      system: `You are a marketing strategist analysing a company website to brief a content team. Infer only what the evidence supports; when unsure, say so briefly instead of inventing details.

${EDITORIAL_RULES}

Return ONE JSON object only:
{
  "businessProfile": {
    "summary": "<2-3 sentences: what the business does and for whom>",
    "industry": "<short label>",
    "audience": "<who buys/reads, their goals and pain points>",
    "products": ["<product or service>"],
    "usps": ["<differentiator supported by the page>"],
    "competitors": ["<likely competitor or category leader — only if evident or well known>"],
    "tone": "<how the site currently sounds>",
    "contentGaps": ["<topic the audience needs that the site does not cover>"]
  },
  "brandVoice": "<3-5 sentence style guide a writer can follow: voice, vocabulary, do/don't>",
  "suggestedTopics": ["<8-15 specific article topics with clear search intent, in the site's language>"]
}`,
      user: [
        `URL: ${page.finalUrl}`,
        `Company: ${website.company.name}${website.company.industry ? ` (${website.company.industry})` : ''}`,
        website.company.description ? `Company description: ${website.company.description}` : '',
        `Language: ${page.lang ?? website.language}; Country: ${website.country}`,
        `Title: ${page.title ?? '(none)'}`,
        `Meta description: ${page.metaDescription ?? '(none)'}`,
        `H1: ${page.h1.join(' | ') || '(none)'}`,
        `H2: ${page.h2.join(' | ') || '(none)'}`,
        `Navigation: ${page.navLinks.map((l) => l.text).join(' | ') || '(none)'}`,
        `CMS/platform hints: ${page.cmsHints.join(', ') || 'unknown'}`,
        `Existing brand voice (keep consistent if present): ${website.brandVoice ?? '(none)'}`,
        `Existing business profile: ${website.businessProfile ? JSON.stringify(website.businessProfile) : '(none)'}`,
        '',
        'Visible text sample:',
        page.textSample,
      ]
        .filter(Boolean)
        .join('\n'),
      metadata: { websiteId: website.id },
    });

    const parsed = analysisSchema.safeParse(completion.parsed);
    if (!parsed.success) {
      throw new Error(
        `Website analysis returned an unexpected shape: ${parsed.error.issues[0]?.message}`,
      );
    }
    const analysis = parsed.data;

    const mergedProfile = {
      ...asRecord(website.businessProfile),
      ...Object.fromEntries(
        Object.entries(analysis.businessProfile).filter(([, v]) =>
          Array.isArray(v) ? v.length > 0 : Boolean(v),
        ),
      ),
    };

    await prisma.website.update({
      where: { id: website.id },
      data: {
        analysis: toJson({
          crawledAt: new Date().toISOString(),
          page: { ...page, textSample: page.textSample.slice(0, 1_000) },
          suggestedTopics: analysis.suggestedTopics,
          contentGaps: analysis.businessProfile.contentGaps,
          model: completion.usage.model,
        }),
        businessProfile: toJson(mergedProfile),
        ...(website.brandVoice ? {} : { brandVoice: analysis.brandVoice || null }),
        lastAnalyzedAt: new Date(),
      },
    });

    await notify({
      companyId: payload.companyId,
      userId: payload.userId,
      type: NotificationType.SUCCESS,
      title: `Website analysis complete: ${website.name}`,
      message: `${analysis.businessProfile.summary || 'Profile updated.'} ${analysis.suggestedTopics.length} topic ideas were generated.`,
      link: `/websites/${website.id}`,
    });

    return { websiteId: website.id, cms: page.cmsHints, topics: analysis.suggestedTopics.length };
  },
);
