import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SignInPage } from '../pages/SignIn';
import { ToastProvider } from '../shared/toast';

vi.mock('../shared/auth', () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    gateError: 'Sign in: someone@gmail.com is not invited.',
  }),
}));

vi.mock('../services/firebase', () => ({
  firebaseConfigured: () => true,
}));

describe('SignInPage', () => {
  it('says invite-only and shows a gate error', () => {
    render(
      <ToastProvider>
        <SignInPage />
      </ToastProvider>
    );
    expect(screen.getByText(/Invite-only/)).toBeInTheDocument();
    expect(screen.getByText('Sign in: someone@gmail.com is not invited.')).toBeInTheDocument();
  });
});
