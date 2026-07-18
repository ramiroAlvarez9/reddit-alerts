import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listBusinesses,
  listMatches,
  type Business,
  type Match,
} from '../lib/api';
import MatchCard from '../components/MatchCard';

export default function Dashboard() {
  const [email, setEmail] = useState(() => localStorage.getItem('reddit-alerts-email') ?? '');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadBusinesses(target: string) {
    setError(null);
    try {
      const { businesses: list } = await listBusinesses(target);
      setBusinesses(list);
      setActiveId(list[0]?.id ?? null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    if (email) void loadBusinesses(email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeId) {
      setMatches([]);
      return;
    }
    setLoading(true);
    listMatches(activeId)
      .then(({ matches: list }) => setMatches(list))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [activeId]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your leads</h1>
        <Link to="/onboarding" className="text-sm text-brand hover:underline">
          + Add business
        </Link>
      </header>

      <div className="mt-6 flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="flex-1 rounded-lg bg-gray-900 border border-gray-700 px-4 py-2 outline-none focus:border-brand"
        />
        <button
          onClick={() => {
            localStorage.setItem('reddit-alerts-email', email);
            void loadBusinesses(email);
          }}
          className="rounded-lg bg-brand hover:bg-brand-dark px-4 py-2 font-medium text-white"
        >
          Load
        </button>
      </div>

      {error && <p className="mt-4 text-red-400 text-sm">{error}</p>}

      {businesses.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {businesses.map((b) => (
            <button
              key={b.id}
              onClick={() => setActiveId(b.id)}
              className={`rounded-full px-3 py-1 text-sm ${
                b.id === activeId ? 'bg-brand text-white' : 'bg-gray-800 text-gray-300'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 space-y-4">
        {loading && <p className="text-gray-500">Loading…</p>}
        {!loading && matches.length === 0 && (
          <p className="text-gray-500">
            No leads yet. Once a scan runs, relevant posts will show up here newest-first.
          </p>
        )}
        {matches.map((m) => (
          <MatchCard key={m.id} match={m} />
        ))}
      </div>
    </div>
  );
}
