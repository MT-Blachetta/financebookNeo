/**
 * Login page – the app's entry point for unauthenticated users.
 *
 * Renders a centred card with username / password fields and a
 * "Stay logged in" checkbox.  On success it redirects to the main
 * SummaryPage.  The NavigationBar is intentionally absent here.
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { useAuth } from '../context/AuthContext';


/* ── Animations ──────────────────────────────────────────────────── */

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
`;


/* ── Styled Components ───────────────────────────────────────────── */

const PageWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  background: #000;
  padding: var(--spacing-md);
`;

const Card = styled.form`
  width: 100%;
  max-width: 400px;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: 2.5rem 2rem;
  animation: ${fadeIn} 0.4s ease-out;
  border: 1px solid #272727;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
`;

const Logo = styled.div`
  text-align: center;
  margin-bottom: 2rem;
`;

const LogoIcon = styled.span`
  font-size: 2.5rem;
  font-weight: 900;
  color: var(--color-positive);
  display: block;
  margin-bottom: 0.5rem;
`;

const AppTitle = styled.h1`
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--color-text-primary);
  letter-spacing: 0.02em;
`;

const Subtitle = styled.p`
  color: var(--color-text-secondary);
  font-size: 0.9rem;
  margin-top: 0.25rem;
`;

const FieldGroup = styled.div`
  margin-bottom: 1.25rem;
`;

const Label = styled.label`
  display: block;
  color: var(--color-text-secondary);
  font-size: 0.85rem;
  margin-bottom: 0.35rem;
  font-weight: 500;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.65rem 0.85rem;
  background: #111;
  border: 1px solid #333;
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s ease;

  &:focus {
    border-color: #2563eb;
  }

  &::placeholder {
    color: #555;
  }
`;

const CheckboxRow = styled.label`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: 0.85rem;
  user-select: none;

  input[type='checkbox'] {
    accent-color: #2563eb;
    width: 16px;
    height: 16px;
    cursor: pointer;
  }
`;

const SubmitButton = styled.button`
  width: 100%;
  padding: 0.75rem;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover:not(:disabled) {
    background: #1d4ed8;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ErrorBanner = styled.div`
  background: rgba(231, 76, 60, 0.15);
  border: 1px solid rgba(231, 76, 60, 0.4);
  color: #e74c3c;
  padding: 0.6rem 0.85rem;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  margin-bottom: 1.25rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
`;


/* ── Component ───────────────────────────────────────────────────── */

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setIsSubmitting(true);
      try {
        await login(username, password, rememberMe);
        navigate('/', { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Login failed');
      } finally {
        setIsSubmitting(false);
      }
    },
    [username, password, rememberMe, login, navigate],
  );

  return (
    <PageWrapper>
      <Card onSubmit={handleSubmit}>
        <Logo>
          <LogoIcon>€</LogoIcon>
          <AppTitle>FinanceBook</AppTitle>
          <Subtitle>Sign in to manage your finances</Subtitle>
        </Logo>

        {error && (
          <ErrorBanner>
            <span>⚠️</span> {error}
          </ErrorBanner>
        )}

        <FieldGroup>
          <Label htmlFor="login-username">Username</Label>
          <Input
            id="login-username"
            type="text"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </FieldGroup>

        <FieldGroup>
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </FieldGroup>

        <CheckboxRow>
          <input
            id="login-remember"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
          Stay logged in
        </CheckboxRow>

        <SubmitButton type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign In'}
        </SubmitButton>
      </Card>
    </PageWrapper>
  );
};

export default LoginPage;
