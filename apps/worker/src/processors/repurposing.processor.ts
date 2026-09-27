import { AIFeature, NotificationType, SocialPostStatus, type SocialPlatform } from '@acsp/database';
import { QUEUES, SocialPlatforms, stripHtml } from '@acsp/shared';
import { z } from 'zod';
import { EDITORIAL_RULES } from '../agents/base-agent';
import { ai, chooseModel } from '../lib/ai';
import { EntityNotFoundError } from '../lib/errors';
import { notify } from '../lib/notifications';
import { prisma } from '../lib/prisma';
import { assertWithinLimits, getSubscription } from '../lib/usage-guard';
import { defineProcessor } from './define-processor';
import { PLATFORM_LIMITS, truncateForPlatform, type RepurposePlatform } from './repurposing.limits';
import { repurposingJobSchema } from './schemas';

const PLATFORM_BRIEFS: Record<RepurposePlatform, string> = {
  X: 'One post ≤ 250 characters (hashtags are appended separately, max 3). Lead with the sharpest insight or a counter-intuitive claim. No links in the text, no thread.',
  LINKEDIN:
    '900–1800 characters. First line is a scroll-stopping hook (no "Excited to share"). Short lines, blank lines between thoughts, 3–5 takeaways, end with a question or a soft CTA. 3–5 hashtags.',
  INSTAGRAM:
    '600–1500 characters. Conversational caption: hook line, 3–5 short value lines with line breaks, CTA to read the full article (link in bio). Up to 15 relevant hashtags (no banned/spam tags). Emojis sparingly and only if on-brand.',
  FACEBOOK:
    '300–900 characters. Friendly, plain-spoken summary of the key takeaway with one concrete example and a question to invite comments. Max 2 hashtags.',
  YOUTUBE:
    'A spoken-word video script (6–9 minutes ≈ 900–1300 words) structured as: HOOK (first 15 seconds, the payoff promise), INTRO, 3–5 SECTIONS each with a heading line, a B-ROLL/ON-SCREEN note in [brackets], and the spoken lines, then RECAP and CTA (subscribe + read the article). Also propose a video title (≤ 70 chars) and a 2-sentence description on the first lines: "TITLE: ..." and "DESCRIPTION: ...".',
  EMAIL_NEWSLETTER:
    'An email. First line MUST be "Subject: <45 chars max>", second line "Preview: <90 chars max>", then a blank line and the body (250–450 words): personal opening, the single most useful idea from the article, a bulleted list of 3 takeaways, one CTA button text in [brackets], and a P.S. No hashtags.',
  SHORT_VIDEO:
    'A 30–60 second vertical video script (Reels/TikTok/Shorts) as numbered SCENES. Each scene: duration in seconds, ON-SCREEN TEXT, VOICEOVER, and a VISUAL note. Scene 1 is a 2-second pattern-interrupt hook. Final scene is a CTA. Total spoken words ≤ 150. Add 3–5 hashtags.',
};

const postSchema = z.object({
  platform: z
    .string()
    .transform((s) => s.toUpperCase().trim())
    .pipe(z.enum(SocialPlatforms)),
  body: z.string().min(1),
  hashtags: z.array(z.string()).catch([]),
});

const outputSchema = z.object({ posts: z.array(postSchema).min(1) });

/**
 * repurposing: turns an article into platform-native social posts / scripts / newsletter copy.
 * Lengths are enforced deterministically with `truncateForPlatform` before saving SocialPost rows.
 */
export const repurposingProcessor = defineProcessor(
  QUEUES.REPURPOSING,
  repurposingJobSchema,
  async ({ payload, jobId, log }) => {
    const content = await prisma.content.findFirst({
      where: { id: payload.contentId, project: { companyId: payload.companyId } },
      include: {
        currentVersion: true,
        keyword: { select: { term: true } },
        project: {
          select: {
            id: true,
            website: {
              select: { brandVoice: true, businessProfile: true, language: true, url: true },
            },
          },
        },
      },
    });
    if (!content) throw new EntityNotFoundError('Content', payload.contentId);
    const version =
      content.currentVersion ??
      (await prisma.contentVersion.findFirst({
        where: { contentId: content.id },
        orderBy: { version: 'desc' },
      }));
    if (!version) throw new EntityNotFoundError('ContentVersion', `for content ${content.id}`);

    const platforms = [...new Set(payload.platforms)] as RepurposePlatform[];
    const subscription = await getSubscription(payload.companyId);
    await assertWithinLimits(payload.companyId, { aiCredits: 1 });

    const website = content.project.website;
    const articleText = stripHtml(version.body).slice(0, 14_000);
    const articleUrl =
      content.publishedUrl ??
      (website?.url ? `${website.url.replace(/\/$/, '')}/${content.slug}` : null);

    const completion = await ai.complete<unknown>({
      feature: AIFeature.REPURPOSING,
      companyId: payload.companyId,
      userId: payload.userId,
      jobId,
      model: chooseModel(subscription.plan),
      json: true,
      temperature: 0.7,
      maxTokens: 6_000,
      system: `You are a social media strategist and scriptwriter who adapts long-form articles into native content for each platform. Each piece must stand alone, sound human, and make the reader want the full article — never a bland summary.

${EDITORIAL_RULES}

Platform rules:
${platforms.map((p) => `- ${PLATFORM_LIMITS[p].label} (${p}): ${PLATFORM_BRIEFS[p]}`).join('\n')}

Return ONE JSON object only:
{ "posts": [ { "platform": "<${platforms.join('|')}>", "body": "<string>", "hashtags": ["<without #>"] } ] }
Exactly one post per requested platform. Use \\n for line breaks inside "body". Language: ${website?.language ?? content.language}.`,
      user: [
        `Article title: ${content.title}`,
        content.keyword?.term ? `Focus keyword: ${content.keyword.term}` : '',
        content.excerpt ? `Excerpt: ${content.excerpt}` : '',
        articleUrl
          ? `Article URL (mention only where the platform allows links): ${articleUrl}`
          : '',
        website?.brandVoice ? `Brand voice: ${website.brandVoice}` : '',
        website?.businessProfile
          ? `Business profile: ${JSON.stringify(website.businessProfile)}`
          : '',
        '',
        'Article text:',
        articleText,
      ]
        .filter(Boolean)
        .join('\n'),
      metadata: { contentId: content.id, platforms },
    });

    const parsed = outputSchema.safeParse(completion.parsed);
    if (!parsed.success) {
      throw new Error(
        `Repurposing returned an unexpected shape: ${parsed.error.issues[0]?.message}`,
      );
    }

    const byPlatform = new Map<string, z.infer<typeof postSchema>>();
    for (const post of parsed.data.posts) byPlatform.set(post.platform, post);

    const created: { id: string; platform: SocialPlatform; truncated: boolean; length: number }[] =
      [];
    const missing: RepurposePlatform[] = [];

    for (const platform of platforms) {
      const post = byPlatform.get(platform);
      if (!post) {
        missing.push(platform);
        continue;
      }
      const fitted = truncateForPlatform(platform, post.body, post.hashtags);
      const row = await prisma.socialPost.create({
        data: {
          projectId: content.projectId,
          contentId: content.id,
          platform: platform as SocialPlatform,
          body: fitted.body,
          hashtags: fitted.hashtags,
          mediaUrls: content.featuredImage ? [content.featuredImage] : [],
          status: SocialPostStatus.DRAFT,
        },
      });
      created.push({
        id: row.id,
        platform: row.platform,
        truncated: fitted.truncated,
        length: fitted.length,
      });
      if (fitted.truncated)
        log.warn({ platform, length: fitted.length }, 'Post truncated to platform limit');
    }

    if (missing.length) log.warn({ missing }, 'Model omitted some platforms');

    await notify({
      companyId: payload.companyId,
      userId: payload.userId,
      type: created.length ? NotificationType.SUCCESS : NotificationType.WARNING,
      title: `Repurposed "${content.title}"`,
      message: created.length
        ? `${created.length} draft(s) created for ${created.map((c) => PLATFORM_LIMITS[c.platform as RepurposePlatform].label).join(', ')}.`
        : 'No posts could be generated. Try again.',
      link: `/content/${content.id}?tab=social`,
    });

    return { created, missing };
  },
);
