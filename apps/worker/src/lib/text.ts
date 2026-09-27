import { stripHtml } from '@acsp/shared';

export function slugify(input: string, maxLength = 80): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return slug || 'untitled';
}

/** Strips ```html fences and full-document wrappers so only body markup remains. */
export function normalizeHtmlBody(raw: string): string {
  let html = raw.trim();
  const fence = /^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?```$/.exec(html);
  if (fence) html = fence[1]!.trim();
  html = html.replace(/<!DOCTYPE[^>]*>/gi, '');
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  if (body) html = body[1]!.trim();
  html = html.replace(/<\/?(html|head)\b[^>]*>/gi, '').trim();
  html = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  return html.trim();
}

/** Removes the first <h1> (CMSes render the title themselves). */
export function stripLeadingH1(html: string): string {
  return html.replace(/^\s*<h1\b[^>]*>[\s\S]*?<\/h1>\s*/i, '').trim();
}

export function hasH1(html: string): boolean {
  return /<h1\b[^>]*>/i.test(html);
}

export function excerptFromHtml(html: string, maxChars = 300): string {
  const text = stripHtml(html).replace(/\n+/g, ' ').trim();
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : maxChars).trim()}…`;
}

export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
