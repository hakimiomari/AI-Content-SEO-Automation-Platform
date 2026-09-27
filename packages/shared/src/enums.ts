export const Roles = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'CONTENT_MANAGER', 'COMPANY_USER'] as const;
export type Role = (typeof Roles)[number];

export const Plans = ['FREE', 'STARTER', 'GROWTH', 'AGENCY'] as const;
export type Plan = (typeof Plans)[number];

export const SubscriptionStatuses = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'INCOMPLETE',
] as const;
export type SubscriptionStatus = (typeof SubscriptionStatuses)[number];

export const ProjectStatuses = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
export type ProjectStatus = (typeof ProjectStatuses)[number];

export const KeywordStatuses = [
  'DISCOVERED',
  'SHORTLISTED',
  'PLANNED',
  'IN_PROGRESS',
  'PUBLISHED',
  'IGNORED',
] as const;
export type KeywordStatus = (typeof KeywordStatuses)[number];

export const SearchIntents = [
  'INFORMATIONAL',
  'NAVIGATIONAL',
  'COMMERCIAL',
  'TRANSACTIONAL',
] as const;
export type SearchIntent = (typeof SearchIntents)[number];

export const ContentTypes = [
  'BLOG_POST',
  'LANDING_PAGE',
  'PRODUCT_PAGE',
  'GUIDE',
  'LISTICLE',
  'COMPARISON',
  'NEWS',
] as const;
export type ContentType = (typeof ContentTypes)[number];

export const ContentStatuses = [
  'BRIEF',
  'GENERATING',
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHED',
  'FAILED',
  'ARCHIVED',
] as const;
export type ContentStatus = (typeof ContentStatuses)[number];

export const SocialPlatforms = [
  'FACEBOOK',
  'LINKEDIN',
  'INSTAGRAM',
  'X',
  'YOUTUBE',
  'EMAIL_NEWSLETTER',
  'SHORT_VIDEO',
] as const;
export type SocialPlatform = (typeof SocialPlatforms)[number];

export const IntegrationProviders = [
  'WORDPRESS',
  'GOOGLE_SEARCH_CONSOLE',
  'LINKEDIN',
  'FACEBOOK',
  'YOUTUBE',
  'SHOPIFY',
  'WEBFLOW',
] as const;
export type IntegrationProvider = (typeof IntegrationProviders)[number];

export const AIFeatures = [
  'KEYWORD_RESEARCH',
  'WEBSITE_ANALYSIS',
  'CONTENT_BRIEF',
  'CONTENT_GENERATION',
  'CONTENT_EDIT',
  'SEO_ANALYSIS',
  'REPURPOSING',
  'QUALITY_CHECK',
  'REPORT',
] as const;
export type AIFeature = (typeof AIFeatures)[number];

export const AIEditorActions = [
  'rewrite',
  'improve',
  'shorten',
  'expand',
  'translate',
  'optimize_seo',
  'generate_cta',
] as const;
export type AIEditorAction = (typeof AIEditorActions)[number];
