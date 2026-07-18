import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { onboard, type DiscoveryResult } from '../lib/api';

interface LocationState {
  websiteUrl?: string;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const state = (useLocation().state as LocationState | null) ?? {};

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState(state.websiteUrl ?? '');
  const [theme, setTheme] = useState('');
  const [problems, setProblems] = useState('');
  const [competitors, setCompetitors] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoveryResult | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { discovery } = await onboard({
        email,
        name,
        websiteUrl: websiteUrl.trim() || undefined,
        theme: theme.trim() || undefined,
        problemsSolved: problems.trim() || undefined,
        competitors: competitors
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
      });
      setResult(discovery);
      localStorage.setItem('reddit-alerts-email', email);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-bold">Your business is set up</h1>
        <p className="mt-2 text-gray-400">
          The AI analyzed your info and picked these communities and keywords to monitor.
        </p>

        <Section title="Value proposition">{result.profile.valueProposition}</Section>
        <Section title="Audience">{result.profile.audience}</Section>

        <div className="mt-6">
          <h3 className="text-sm uppercase tracking-wide text-gray-500">Subreddits</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {result.subreddits.map((s) => (
              <span key={s} className="rounded-full bg-gray-800 px-3 py-1 text-sm">
                r/{s}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-sm uppercase tracking-wide text-gray-500">Keywords</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {result.keywords.map((k) => (
              <span key={k} className="rounded-full bg-gray-800 px-3 py-1 text-sm">
                {k}
              </span>
            ))}
          </div>
        </div>

        <button
          onClick={() => navigate('/dashboard')}
          className="mt-10 rounded-lg bg-brand hover:bg-brand-dark px-6 py-3 font-semibold text-white"
        >
          Go to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold">Tell us about your business</h1>
      <p className="mt-2 text-gray-400">
        Paste your site and/or describe what you do. We derive your subreddits automatically.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <Field label="Email (for alerts)">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Business name">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Website URL">
          <input
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://yourproduct.com"
            className="input"
          />
        </Field>
        <Field label="Theme / what you do">
          <input
            type="text"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Problems you solve">
          <textarea
            value={problems}
            onChange={(e) => setProblems(e.target.value)}
            className="input h-24"
          />
        </Field>
        <Field label="Competitors (comma-separated)">
          <input
            type="text"
            value={competitors}
            onChange={(e) => setCompetitors(e.target.value)}
            className="input"
          />
        </Field>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand hover:bg-brand-dark px-6 py-3 font-semibold text-white disabled:opacity-60"
        >
          {loading ? 'Analyzing…' : 'Analyze & find subreddits'}
        </button>
      </form>

      <style>{`.input{width:100%;border-radius:0.5rem;background:#111827;border:1px solid #374151;padding:0.6rem 0.75rem;outline:none;color:#e5e7eb}.input:focus{border-color:#a855f7}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm text-gray-400">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="text-sm uppercase tracking-wide text-gray-500">{title}</h3>
      <p className="mt-1 text-gray-200">{children}</p>
    </div>
  );
}
