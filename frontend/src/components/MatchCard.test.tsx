import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import MatchCard from './MatchCard';
import type { Match } from '../lib/api';

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    business_id: 'b1',
    reddit_post_id: 'p1',
    subreddit: 'SaaS',
    title: 'Looking for a CRM tool',
    body: '',
    url: 'https://reddit.com/r/SaaS/comments/p1',
    permalink: 'https://www.reddit.com/r/SaaS/comments/p1/looking',
    author: 'alice',
    created_utc: 1_700_000_000,
    intent: 'high',
    tags: ['Asked Recommendation', 'Recent'],
    reply_draft: 'Hey! Try our tool…',
    reason: 'clear intent',
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('MatchCard', () => {
  it('renders title, subreddit, author, formatted date, and intent badge', () => {
    render(<MatchCard match={makeMatch()} />);

    expect(screen.getByText('Looking for a CRM tool')).toBeInTheDocument();
    expect(screen.getByText(/r\/SaaS/)).toBeInTheDocument();
    expect(screen.getByText(/u\/alice/)).toBeInTheDocument();
    expect(screen.getByText('high intent')).toBeInTheDocument();
    expect(screen.getByText('Asked Recommendation')).toBeInTheDocument();
    expect(screen.getByText('Recent')).toBeInTheDocument();
  });

  it('renders the reason when present', () => {
    render(<MatchCard match={makeMatch({ reason: 'this person wants a CRM' })} />);
    expect(screen.getByText('this person wants a CRM')).toBeInTheDocument();
  });

  it('hides the reason when null', () => {
    render(<MatchCard match={makeMatch({ reason: null, reply_draft: null, tags: [] })} />);
    expect(screen.queryByText(/clear intent/)).not.toBeInTheDocument();
  });

  it('renders the reply draft inside a collapsible details', () => {
    render(<MatchCard match={makeMatch()} />);
    const summary = screen.getByText(/suggested reply/i);
    expect(summary).toBeInTheDocument();
    expect(screen.queryByText('Hey! Try our tool…')).not.toBeVisible();
    fireEvent.click(summary);
    expect(screen.getByText('Hey! Try our tool…')).toBeVisible();
  });

  it('hides the reply draft section when reply_draft is null', () => {
    render(<MatchCard match={makeMatch({ reply_draft: null })} />);
    expect(screen.queryByText(/suggested reply/i)).not.toBeInTheDocument();
  });

  it('hides the tags row when no tags', () => {
    render(<MatchCard match={makeMatch({ tags: [] })} />);
    expect(screen.queryByText('Asked Recommendation')).not.toBeInTheDocument();
  });

  it('renders a "Go comment" link pointing to the permalink', () => {
    render(<MatchCard match={makeMatch()} />);
    const link = screen.getByRole('link', { name: /go comment/i });
    expect(link).toHaveAttribute('href', 'https://www.reddit.com/r/SaaS/comments/p1/looking');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it.each([
    ['high', 'green'],
    ['medium', 'yellow'],
    ['low', 'gray'],
  ] as const)('applies the right intent styling for %s', (intent, color) => {
    render(<MatchCard match={makeMatch({ intent })} />);
    const badge = screen.getByText(`${intent} intent`);
    expect(badge.className).toContain(color);
  });
});
