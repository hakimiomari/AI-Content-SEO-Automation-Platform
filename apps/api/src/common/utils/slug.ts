/** Turns "Acme Demo Co!" into "acme-demo-co". Falls back to "company" when empty. */
export function slugify(input: string, fallback = 'company'): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug.length >= 2 ? slug : fallback;
}

/** Short lowercase alphanumeric suffix used to de-duplicate slugs. */
export function shortSuffix(length = 5): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
