/** BullMQ queue names — one queue per background workflow. */
export const QUEUES = {
  KEYWORD_RESEARCH: 'keyword-research',
  WEBSITE_ANALYSIS: 'website-analysis',
  CONTENT_GENERATION: 'content-generation',
  SEO_ANALYSIS: 'seo-analysis',
  REPURPOSING: 'repurposing',
  PUBLISHING: 'publishing',
  ANALYTICS_SYNC: 'analytics-sync',
  REPORT_GENERATION: 'report-generation',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface BaseJobPayload {
  companyId: string;
  userId?: string;
  requestId?: string;
}

export interface KeywordResearchJob extends BaseJobPayload {
  projectId: string;
  topic: string;
  seedKeywords?: string[];
  country?: string;
  language?: string;
}

export interface WebsiteAnalysisJob extends BaseJobPayload {
  websiteId: string;
}

export interface ContentGenerationJob extends BaseJobPayload {
  projectId: string;
  briefId: string;
  contentId?: string;
}

export interface SeoAnalysisJob extends BaseJobPayload {
  contentId: string;
  keyword?: string;
}

export interface RepurposingJob extends BaseJobPayload {
  contentId: string;
  platforms: string[];
}

export interface PublishingJob extends BaseJobPayload {
  scheduleId: string;
}

export interface AnalyticsSyncJob extends BaseJobPayload {
  websiteId: string;
  integrationId: string;
  from?: string;
  to?: string;
}

export interface ReportGenerationJob extends BaseJobPayload {
  projectId: string;
  from: string;
  to: string;
}

export type JobPayloadMap = {
  [QUEUES.KEYWORD_RESEARCH]: KeywordResearchJob;
  [QUEUES.WEBSITE_ANALYSIS]: WebsiteAnalysisJob;
  [QUEUES.CONTENT_GENERATION]: ContentGenerationJob;
  [QUEUES.SEO_ANALYSIS]: SeoAnalysisJob;
  [QUEUES.REPURPOSING]: RepurposingJob;
  [QUEUES.PUBLISHING]: PublishingJob;
  [QUEUES.ANALYTICS_SYNC]: AnalyticsSyncJob;
  [QUEUES.REPORT_GENERATION]: ReportGenerationJob;
};

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: 500,
  removeOnFail: 1_000,
} as const;
