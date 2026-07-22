import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const { navigateMock, onboardMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  onboardMock: vi.fn(),
}));

vi.mock('../lib/api', () => ({ onboard: onboardMock }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock, useLocation: () => ({ state: null }) };
});

import Onboarding from './Onboarding';
import type { DiscoveryResult } from '../lib/api';

const sampleDiscovery: DiscoveryResult = {
  profile: {
    valueProposition: 'Save time on Reddit lead gen',
    audience: 'SaaS founders',
    painsSolved: ['scanning subs', 'writing replies'],
  },
  subreddits: ['SaaS', 'startups'],
  keywords: ['crm', 'cold outreach'],
};

function renderOnboarding() {
  return render(
    <MemoryRouter>
      <Onboarding />
    </MemoryRouter>,
  );
}

function fillForm(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'u@example.com' } });
  fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: 'Acme' } });
  return user;
}

describe('Onboarding', () => {
  beforeEach(() => {
    onboardMock.mockReset();
    navigateMock.mockReset();
    localStorage.clear();
  });

  it('renders the form with required fields', () => {
    renderOnboarding();
    expect(screen.getByRole('heading', { name: /tell us about your business/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeRequired();
    expect(screen.getByLabelText(/business name/i)).toBeRequired();
  });

  it('submits the form, calls onboard, and stores the email in localStorage', async () => {
    onboardMock.mockResolvedValue({ business: { id: 'b1' }, discovery: sampleDiscovery });
    renderOnboarding();

    const user = userEvent.setup();
    fillForm(user);

    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));

    await waitFor(() => {
      expect(onboardMock).toHaveBeenCalledWith({
        email: 'u@example.com',
        name: 'Acme',
        websiteUrl: undefined,
        theme: undefined,
        problemsSolved: undefined,
        competitors: [],
      });
    });

    expect(localStorage.getItem('reddit-alerts-email')).toBe('u@example.com');
  });

  it('parses comma-separated competitors and trims inputs', async () => {
    onboardMock.mockResolvedValue({ business: { id: 'b1' }, discovery: sampleDiscovery });
    renderOnboarding();

    const user = userEvent.setup();
    fillForm(user);
    fireEvent.change(screen.getByLabelText(/website url/i), {
      target: { value: '  https://acme.com  ' },
    });
    fireEvent.change(screen.getByLabelText(/theme/i), { target: { value: '  reddit alerts  ' } });
    fireEvent.change(screen.getByLabelText(/problems you solve/i), {
      target: { value: 'manual scanning' },
    });
    fireEvent.change(screen.getByLabelText(/competitors/i), {
      target: { value: ' F5Bot , GummySearch, , ConvoHunter ' },
    });

    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));

    await waitFor(() => {
      expect(onboardMock).toHaveBeenCalledWith(
        expect.objectContaining({
          websiteUrl: 'https://acme.com',
          theme: 'reddit alerts',
          problemsSolved: 'manual scanning',
          competitors: ['F5Bot', 'GummySearch', 'ConvoHunter'],
        }),
      );
    });
  });

  it('shows the result screen with profile, subreddits, and keywords on success', async () => {
    onboardMock.mockResolvedValue({ business: { id: 'b1' }, discovery: sampleDiscovery });
    renderOnboarding();

    const user = userEvent.setup();
    fillForm(user);
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /your business is set up/i })).toBeInTheDocument();
    });
    expect(screen.getByText('Save time on Reddit lead gen')).toBeInTheDocument();
    expect(screen.getByText('SaaS founders')).toBeInTheDocument();
    expect(screen.getByText('r/SaaS')).toBeInTheDocument();
    expect(screen.getByText('r/startups')).toBeInTheDocument();
    expect(screen.getByText('crm')).toBeInTheDocument();
    expect(screen.getByText('cold outreach')).toBeInTheDocument();
  });

  it('navigates to /dashboard when "Go to dashboard" is clicked', async () => {
    onboardMock.mockResolvedValue({ business: { id: 'b1' }, discovery: sampleDiscovery });
    renderOnboarding();

    const user = userEvent.setup();
    fillForm(user);
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /go to dashboard/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /go to dashboard/i }));
    expect(navigateMock).toHaveBeenCalledWith('/dashboard');
  });

  it('displays an error message when onboard fails', async () => {
    onboardMock.mockRejectedValue(new Error('Provide a websiteUrl or a theme'));
    renderOnboarding();

    const user = userEvent.setup();
    fillForm(user);
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));

    expect(await screen.findByText('Provide a websiteUrl or a theme')).toBeInTheDocument();
  });
});
