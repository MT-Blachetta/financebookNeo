/**
 * Authentication context for FinanceBook.
 *
 * Manages JWT token storage, user profile state, and login/logout flows.
 *
 * "Stay logged in" logic:
 *   - Checked   → token stored in localStorage  (persists across sessions)
 *   - Unchecked → token stored in sessionStorage (cleared when tab closes)
 *
 * On mount the provider checks both storages for an existing token and
 * validates it by calling GET /auth/me.  If validation fails the token is
 * cleared and the user is sent to the login page.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UserRead } from '../types';

const TOKEN_KEY = 'financebook_token';

// ── Helpers ────────────────────────────────────────────────────────

/** Read token from whichever storage it lives in. */
function getStoredToken(): string | null {
    return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}

/** Persist token in the correct storage. */
function storeToken(token: string, remember: boolean): void {
    if (remember) {
        localStorage.setItem(TOKEN_KEY, token);
        sessionStorage.removeItem(TOKEN_KEY);
    } else {
        sessionStorage.setItem(TOKEN_KEY, token);
        localStorage.removeItem(TOKEN_KEY);
    }
}

/** Remove token from both storages. */
function clearStoredToken(): void {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
}

// ── Context shape ──────────────────────────────────────────────────

interface AuthContextValue {
    token: string | null;
    user: UserRead | null;
    isLoading: boolean;
    login: (username: string, password: string, rememberMe: boolean) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ── Provider ───────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [token, setToken] = useState<string | null>(null);
    const [user, setUser] = useState<UserRead | null>(null);
    const [isLoading, setIsLoading] = useState(true); // true while validating on mount
    const queryClient = useQueryClient();

    /**
     * Validate an existing token by fetching the user profile.
     * Returns the user on success, null on failure.
     */
    const validateToken = useCallback(async (existingToken: string): Promise<UserRead | null> => {
        try {
            const res = await fetch('/api/auth/me', {
                headers: { Authorization: `Bearer ${existingToken}` },
            });
            if (!res.ok) return null;
            return (await res.json()) as UserRead;
        } catch {
            return null;
        }
    }, []);

    // On mount: check for stored token and validate
    useEffect(() => {
        const init = async () => {
            const stored = getStoredToken();
            if (stored) {
                const profile = await validateToken(stored);
                if (profile) {
                    setToken(stored);
                    setUser(profile);
                } else {
                    clearStoredToken();
                }
            }
            setIsLoading(false);
        };
        init();
    }, [validateToken]);

    /** Authenticate and store token. */
    const login = useCallback(
        async (username: string, password: string, rememberMe: boolean) => {
            // POST /auth/login expects application/x-www-form-urlencoded
            const body = new URLSearchParams();
            body.append('username', username);
            body.append('password', password);

            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
            });

            if (!res.ok) {
                const detail = await res.json().catch(() => ({}));
                throw new Error(detail.detail ?? 'Login failed');
            }

            const { access_token } = (await res.json()) as { access_token: string; token_type: string };

            storeToken(access_token, rememberMe);
            setToken(access_token);

            // Fetch user profile
            const profile = await validateToken(access_token);
            if (!profile) throw new Error('Failed to load user profile');
            setUser(profile);
        },
        [validateToken],
    );

    /** Clear all auth state. */
    const logout = useCallback(() => {
        clearStoredToken();
        setToken(null);
        setUser(null);
        queryClient.clear(); // wipe cached data from previous user
    }, [queryClient]);

    return (
        <AuthContext.Provider value={{ token, user, isLoading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

// ── Hook ───────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
    return ctx;
}
