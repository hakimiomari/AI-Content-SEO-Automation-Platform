import { KeywordStatus, NotificationType, type Prisma } from '@acsp/database';
import { QUEUES } from '@acsp/shared';
import { ResearchAgent, normalizeTerm } from '../agents/research-agent';
import { chooseModel } from '../lib/ai';
import { EntityNotFoundError } from '../lib/errors';
import { notify } from '../lib/notifications';
import { prisma, toJson } from '../lib/prisma';
import { assertWithinLimits, getSubscription } from '../lib/usage-guard';
import { defineProcessor } from './define-processor';
import { keywordResearchJobSchema } from './schemas';

const researchAgent = new ResearchAgent();

/**
 * keyword-research: Research Agent → KeywordCluster + Keyword rows (status DISCOVERED, source 'ai').
 * Existing keywords are matched on `@@unique([projectId, term])`; manual/GSC data is never
 * overwritten with AI estimates.
 */
export const keywordResearchProcessor = defineProcessor(
  QUEUES.KEYWORD_RESEARCH,
  keywordResearchJobSchema,
  async ({ payload, jobId, log }) => {
    const project = await prisma.project.findFirst({
      where: { id: payload.projectId, companyId: payload.companyId },
      include: { website: true },
    });
    if (!project) throw new EntityNotFoundError('Project', payload.projectId);

    const subscription = await getSubscription(payload.companyId);
    await assertWithinLimits(payload.companyId, { aiCredits: 2 });

    const existing = await prisma.keyword.findMany({
      where: { projectId: project.id },
      select: { id: true, term: true, source: true, clusterId: true },
    });
    const existingByTerm = new Map(existing.map((k) => [normalizeTerm(k.term), k]));

    const result = await researchAgent.run(
      {
        topic: payload.topic,
        seedKeywords: payload.seedKeywords,
        businessProfile: project.website?.businessProfile,
        brandVoice: project.website?.brandVoice,
        websiteDomain: project.website?.domain,
        country: payload.country ?? project.website?.country ?? 'US',
        language: payload.language ?? project.website?.language ?? 'en',
        existingKeywords: existing.map((k) => k.term),
      },
      {
        companyId: payload.companyId,
        userId: payload.userId,
        jobId,
        model: chooseModel(subscription.plan),
        logger: log,
      },
    );

    let created = 0;
    let updated = 0;
    let clustersCreated = 0;

    for (const cluster of result.clusters) {
      const clusterRow = await prisma.$transaction(async (tx) => {
        const found = await tx.keywordCluster.findFirst({
          where: { projectId: project.id, name: { equals: cluster.name, mode: 'insensitive' } },
        });
        if (found) {
          return tx.keywordCluster.update({
            where: { id: found.id },
            data: {
              description: found.description ?? cluster.description ?? null,
              intent: found.intent ?? cluster.intent ?? null,
              pillar: found.pillar || cluster.pillar,
            },
          });
        }
        clustersCreated += 1;
        return tx.keywordCluster.create({
          data: {
            projectId: project.id,
            name: cluster.name,
            description: cluster.description ?? null,
            intent: cluster.intent ?? null,
            pillar: cluster.pillar,
          },
        });
      });

      for (const kw of cluster.keywords) {
        const metadata: Prisma.InputJsonValue = toJson({
          rationale: kw.rationale,
          estimatedVolume: kw.estimatedVolume,
          estimatedDifficulty: kw.estimatedDifficulty,
          topic: payload.topic,
          discoveredByJob: jobId,
        });
        const prior = existingByTerm.get(kw.term);

        if (!prior) {
          await prisma.keyword.upsert({
            where: { projectId_term: { projectId: project.id, term: kw.term } },
            create: {
              projectId: project.id,
              clusterId: clusterRow.id,
              term: kw.term,
              volume: kw.estimatedVolume,
              difficulty: kw.estimatedDifficulty,
              intent: kw.intent,
              opportunity: kw.opportunity,
              status: KeywordStatus.DISCOVERED,
              source: 'ai',
              metadata,
            },
            update: {
              clusterId: clusterRow.id,
              opportunity: kw.opportunity,
              metadata,
            },
          });
          created += 1;
          continue;
        }

        // Existing keyword: AI-sourced rows get refreshed estimates; human/GSC rows keep their numbers.
        const aiSourced = !prior.source || prior.source === 'ai';
        await prisma.keyword.update({
          where: { id: prior.id },
          data: {
            ...(aiSourced
              ? {
                  volume: kw.estimatedVolume,
                  difficulty: kw.estimatedDifficulty,
                  intent: kw.intent,
                }
              : {}),
            opportunity: kw.opportunity,
            ...(prior.clusterId ? {} : { clusterId: clusterRow.id }),
            metadata,
          },
        });
        updated += 1;
      }
    }

    await notify({
      companyId: payload.companyId,
      userId: payload.userId,
      type: NotificationType.SUCCESS,
      title: `Keyword research finished for "${payload.topic}"`,
      message:
        `${created} new keywords in ${result.clusters.length} clusters (${clustersCreated} new). ${result.summary ?? ''}`.trim(),
      link: `/projects/${project.id}/keywords`,
    });

    return {
      clusters: result.clusters.length,
      clustersCreated,
      created,
      updated,
      aiCalls: result.calls,
    };
  },
);
