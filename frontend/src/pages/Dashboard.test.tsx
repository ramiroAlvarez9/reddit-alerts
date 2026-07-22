import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { navigateMock, listBusinesses, listMatches } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  listBusinesses: vi.fn(),
  listMatches: vi.fn(),
}));

vi.mock('../lib/api', () => ({ listBusinesses, listMatches }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock, Link: actual.Link };
});

import Dashboard from './Dashboard';
import type { Business, Match } from '../lib/api';

function makeBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: 'b1',
    user_id: 'u1',
    name: 'Acme',
    website_url: null,
    theme: 'reddit alerts',
    problems_solved: '',
    competitors: [],
    profile: null,
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    business_id: 'b1',
    reddit_post_id: 'p1',
    subreddit: 'SaaS',
    title: 'Looking for a tool',
    body: '',
    url: 'https://reddit.com/r/SaaS/comments/p1',
    permalink: 'https://www.reddit.com/r/SaaS/comments/p1/looking',
    author: 'alice',
    created_utc: 1_700_000_000,
    intent: 'high',
    tags: ['Asked Recommendation'],
    reply_draft: 'try us',
    reason: 'clear intent',
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    listBusinesses.mockReset();
    listMatches.mockReset();
    localStorage.clear();
  });

  it('renders the empty state with a prompt to load businesses', () => {
    renderDashboard();
    expect(screen.getByRole('heading', { name: /your leads/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /load/i })).toBeInTheDocument();
  });

  it('loads businesses for the entered email and shows the empty-matches state', async () => {
    listBusinesses.mockResolvedValue({ businesses: [makeBusiness()] });
    listMatches.mockResolvedValue({ matches: [] });

    renderDashboard();
    fireEvent.change(screen.getByPlaceholderText('your@email.com'), {
      target: { value: 'u@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /load/i }));

    await waitFor(() => {
      expect(listBusinesses).toHaveBeenCalledWith('u@example.com');
    });

    expect(await screen.findByRole('button', { name: 'Acme' })).toBeInTheDocument();
    expect(
      await screen.findByText(/no leads yet\. once a scan runs/i),
    ).toBeInTheDocument();
  });

  it('preloads the email from localStorage on mount', async () => {
    localStorage.setItem('reddit-alerts-email', 'cached@example.com');
    listBusinesses.mockResolvedValue({ businesses: [] });

    renderDashboard();

    await waitFor(() => {
      expect(listBusinesses).toHaveBeenCalledWith('cached@example.com');
    });
    expect(screen.getByPlaceholderText('your@email.com')).toHaveValue('cached@example.com');
  });

  it('loads matches for the active business and renders MatchCards', async () => {
    listBusinesses.mockResolvedValue({
      businesses: [makeBusiness({ id: 'b1' }), makeBusiness({ id: 'b2', name: 'Beta' })],
    });
    listMatches.mockImplementation(async (businessId: string) => {
      if (businessId === 'b1') return { matches: [makeMatch({ id: 'm1' })] };
      return { matches: [makeMatch({ id: 'm2', title: 'Another lead' })] };
    });

    renderDashboard();
    fireEvent.change(screen.getByPlaceholderText('your@email.com'), {
      target: { value: 'u@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /load/i }));

    await screen.findByRole('button', { name: 'Acme' });
    expect(await screen.findByText('Looking for a tool')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));

    await waitFor(() => {
      expect(listMatches).toHaveBeenLastCalledWith('b2');
    });
    expect(await screen.findByText('Another lead')).toBeInTheDocument();
  });

  it('persists the entered email to localStorage when Load is clicked', async () => {
    listBusinesses.mockResolvedValue({ businesses: [] });

    renderDashboard();
    fireEvent.change(screen.getByPlaceholderText('your@email.com'), {
      target: { value: 'fresh@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /load/i }));

    await waitFor(() => {
      expect(listBusinesses).toHaveBeenCalledWith('fresh@example.com');
    });
    expect(localStorage.getItem('reddit-alerts-email')).toBe('fresh@example.com');
  });

  it('shows an inline error when the API call fails', async () => {
    listBusinesses.mockRejectedValue(new Error('boom'));

    renderDashboard();
    fireEvent.change(screen.getByPlaceholderText('your@email.com'), {
      target: { value: 'u@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /load/i }));

    expect(await screen.findByText('boom')).toBeInTheDocument();
  });
});
