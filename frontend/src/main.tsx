/**
 * Entry point for the FinanceBook web application.
 *
 *  – Mounts React to the DOM
 *  – Configures React-Query (TanStack) for data-fetching & caching
 *  – Sets up React-Router for client-side navigation
 *
 * Every other part of the front-end is rendered inside the Router so that we
 * can provide deep-linkable URLs and a modern SPA experience.
 *
 * 2025 FinanceBook – MIT License
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import { GlobalStyle } from './styles/globalStyle'; // global CSS-in-JS reset
import App from './App';


// Query-Client configuration

/**
 * A single QueryClient instance is shared across the entire application.
 * The configuration below reflects common production defaults:
 *
 *   – Stale time:   fresh for 30s avoids refetching on every window focus
 *   – Retry:        exponential-backoff, max = 3
 *   – Refetch on window-focus: enabled (good for finance data consistency)
 *
 * You can fine-tune these per-query in the individual hooks.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 3,
      refetchOnWindowFocus: true,
    },
  },
});


// Mount React

const container = document.getElementById('root');
if (!container) {
  throw new Error(
    "Root container with id='root' was not found in index.html. " +
      'Did Vite inject the template correctly ?',
  );
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* Global CSS-reset & design-tokens */}
        <GlobalStyle />
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);