/** Fetch a URL and return a rough plain-text extraction of its body. */
export async function fetchWebsiteText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'reddit-alerts/0.1 (+onboarding)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch website: ${res.status}`);
  }
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
