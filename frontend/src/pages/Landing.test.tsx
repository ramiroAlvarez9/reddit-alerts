import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import Landing from './Landing';

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

describe('Landing', () => {
  it('renders the headline and the form', () => {
    renderLanding();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Show up where your buyers/i);
    expect(screen.getByPlaceholderText('https://yourproduct.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /find my first leads/i })).toBeInTheDocument();
  });

  it('navigates to /onboarding with the trimmed URL when submitted', () => {
    renderLanding();
    const input = screen.getByPlaceholderText('https://yourproduct.com');
    fireEvent.change(input, { target: { value: '  https://acme.com  ' } });
    fireEvent.click(screen.getByRole('button', { name: /find my first leads/i }));

    expect(navigateMock).toHaveBeenCalledWith('/onboarding', {
      state: { websiteUrl: 'https://acme.com' },
    });
  });

  it('navigates without websiteUrl when the input is empty', () => {
    renderLanding();
    fireEvent.click(screen.getByRole('button', { name: /find my first leads/i }));

    expect(navigateMock).toHaveBeenCalledWith('/onboarding', { state: { websiteUrl: undefined } });
  });

  it('exposes a Dashboard link in the header', () => {
    renderLanding();
    expect(screen.getByRole('button', { name: /dashboard/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /dashboard/i }));
    expect(navigateMock).toHaveBeenCalledWith('/dashboard');
  });
});
