import type { Match } from '../lib/api';

const INTENT_STYLES: Record<Match['intent'], string> = {
  high: 'bg-green-500/15 text-green-400 border-green-500/30',
  medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  low: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
};

export default function MatchCard({ match }: { match: Match }) {
  const when = new Date(match.created_utc * 1000).toLocaleString();

  return (
    <article className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <a
            href={match.permalink}
            target="_blank"
            rel="noreferrer"
            className="font-semibold hover:text-brand"
          >
            {match.title}
          </a>
          <div className="mt-1 text-sm text-gray-500">
            r/{match.subreddit} · u/{match.author} · {when}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${INTENT_STYLES[match.intent]}`}
        >
          {match.intent} intent
        </span>
      </div>

      {match.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {match.tags.map((t) => (
            <span key={t} className="rounded-full bg-gray-800 px-2.5 py-0.5 text-xs">
              {t}
            </span>
          ))}
        </div>
      )}

      {match.reason && <p className="mt-3 text-sm text-gray-400">{match.reason}</p>}

      {match.reply_draft && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-brand">Suggested reply (edit before posting)</summary>
          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-950 p-3 text-sm text-gray-300">
            {match.reply_draft}
          </p>
        </details>
      )}

      <a
        href={match.permalink}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-block rounded-lg bg-brand hover:bg-brand-dark px-4 py-2 text-sm font-medium text-white"
      >
        Go comment →
      </a>
    </article>
  );
}
