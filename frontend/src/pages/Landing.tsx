import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    navigate('/onboarding', { state: { websiteUrl: url.trim() || undefined } });
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-6 py-5 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 font-semibold text-lg">
          <span className="inline-block h-5 w-5 rounded-full bg-brand" />
          Reddit Alerts
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="text-sm text-gray-300 hover:text-white"
        >
          Dashboard
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-6 pt-16 pb-24 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
          Show up where your buyers
          <br />
          are already talking on <span className="text-brand">Reddit</span>
        </h1>
        <p className="mt-6 text-gray-400 text-lg">
          We find the threads your buyers care about, score them by intent, and email you the
          ones worth answering. You reply in your own voice — no auto-posting, no bans.
        </p>

        <form onSubmit={handleSubmit} className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourproduct.com"
            className="w-full sm:w-96 rounded-lg bg-gray-900 border border-gray-700 px-4 py-3 outline-none focus:border-brand"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand hover:bg-brand-dark px-6 py-3 font-semibold text-white whitespace-nowrap"
          >
            Find my first leads
          </button>
        </form>
        <p className="mt-3 text-sm text-gray-500">
          2-min setup · AI finds your subreddits · No auto-posting
        </p>
      </main>
    </div>
  );
}
