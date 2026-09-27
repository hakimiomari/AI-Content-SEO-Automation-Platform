import { QUEUES, type QueueName } from '@acsp/shared';
import { analyticsSyncProcessor } from './analytics-sync.processor';
import { contentGenerationProcessor } from './content-generation.processor';
import type { ProcessorFn } from './define-processor';
import { keywordResearchProcessor } from './keyword-research.processor';
import { publishingProcessor } from './publishing.processor';
import { reportGenerationProcessor } from './report-generation.processor';
import { repurposingProcessor } from './repurposing.processor';
import { seoAnalysisProcessor } from './seo-analysis.processor';
import { websiteAnalysisProcessor } from './website-analysis.processor';

/** One processor per queue defined in @acsp/shared. */
export const PROCESSORS: Record<QueueName, ProcessorFn> = {
  [QUEUES.KEYWORD_RESEARCH]: keywordResearchProcessor,
  [QUEUES.WEBSITE_ANALYSIS]: websiteAnalysisProcessor,
  [QUEUES.CONTENT_GENERATION]: contentGenerationProcessor,
  [QUEUES.SEO_ANALYSIS]: seoAnalysisProcessor,
  [QUEUES.REPURPOSING]: repurposingProcessor,
  [QUEUES.PUBLISHING]: publishingProcessor,
  [QUEUES.ANALYTICS_SYNC]: analyticsSyncProcessor,
  [QUEUES.REPORT_GENERATION]: reportGenerationProcessor,
};

export type { ProcessorFn } from './define-processor';
