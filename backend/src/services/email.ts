import { config } from '../config.js';
import type { Match } from '../types.js';

/** Sends a digest email of new relevant posts via Resend. No-ops if unconfigured. */
export async function sendDigestEmail(to: string, matches: Match[]): Promise<boolean> {
  if (!config.email.resendApiKey) {
    console.warn('[email] RESEND_API_KEY not set; skipping email send');
    return false;
  }
  if (matches.length === 0) return false;

  const rows = matches
    .map(
      (m) => `
      <li style="margin-bottom:16px">
        <a href="${m.permalink}" style="font-weight:600">${escapeHtml(m.title)}</a>
        <div style="color:#666;font-size:13px">
          r/${escapeHtml(m.subreddit)} · intent: ${m.intent} · ${m.tags.map(escapeHtml).join(', ')}
        </div>
      </li>`,
    )
    .join('');

  const html = `
    <div style="font-family:sans-serif;max-width:560px">
      <h2>${matches.length} new conversation(s) worth answering</h2>
      <ul style="list-style:none;padding:0">${rows}</ul>
      <p style="color:#888;font-size:12px">Reply genuinely — add value first, disclose your affiliation, no spam.</p>
    </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.email.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.email.from,
      to,
      subject: `${matches.length} new Reddit lead(s) for your business`,
      html,
    }),
  });

  if (!res.ok) {
    console.error('[email] Resend send failed:', res.status, await res.text());
    return false;
  }
  return true;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
