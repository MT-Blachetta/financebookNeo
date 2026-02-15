/**
 * Root component that defines the global application layout and routes.
 *
 * Authentication gating:
 *   - Unauthenticated users see only the LoginPage (no NavigationBar)
 *   - Authenticated users see the full app with NavigationBar + Routes
 *
 * Individual screens such as the "Summary" page are lazy-loaded to keep the
 * initial bundle small.  React-Router will automatically code-split when using
 * 'lazy()' + 'Suspense'.
 */

import React, { lazy, Suspense, useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';

import { NavigationBar, ViewFilter } from './components/NavigationBar';
import { useAuth } from './context/AuthContext';


// lazy-loaded route modules

// lazy-loaded page components for better initial load performance.
// React.lazy and Suspense handle code-splitting and loading states.
const SummaryPage = lazy(() => import('./pages/SummaryPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const AddItemPage = lazy(() => import('./pages/AddItemPage')); // page for creating new payment items
const AddSuccessPage = lazy(() => import('./pages/AddSuccessPage')); // success page after creating payment
const EditItemPage = lazy(() => import('./pages/EditItemPage')); // page for editing existing payment items
const CategoryManagerPage = lazy(() => import('./pages/CategoryManagerPage')); // page for managing category types
const CategoryEditPage = lazy(() => import('./pages/CategoryEditPage')); // page for managing categories
const StatisticsPage = lazy(() => import('./pages/StatisticsPage')); // statistics & charts page


// Layout

/** Application wrapper ensures content is centred and scrollable. */
const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: #000; /* page background as requested */
`;

const Content = styled.main`
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 48rem; /* keep readable line-length on desktop */
  margin-inline: auto;
  padding: 1rem;
  color: #eaeaea; /* light grey text for contrast on black */
`;

/** Full-screen loading spinner shown while auth state is being determined. */
const LoadingScreen = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  background: #000;
  color: var(--color-text-secondary);
  font-size: 1.1rem;
`;


// Component

const App: React.FC = () => {
  const navigate = useNavigate();
  const { token, isLoading, logout } = useAuth();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // get current filter from URL to show active state in navigation
  const [searchParams] = useSearchParams();
  const currentFilter = (searchParams.get('filter') as ViewFilter) || 'all';

  /**
   * Handles filter changes from the global NavigationBar.
   * Preserves existing category filters when changing the view filter.
   * Also closes the drawer if it's open.
   * @param filter - The selected ViewFilter ('all', 'expenses', 'incomes').
   */
  const handleGlobalNavFilterChange = (filter: ViewFilter) => {
    // Preserve existing category filters from current URL
    const newSearchParams = new URLSearchParams(searchParams);

    // Update or remove the filter parameter
    if (filter === 'all') {
      newSearchParams.delete('filter');
    } else {
      newSearchParams.set('filter', filter);
    }

    // Navigate with preserved parameters
    const queryString = newSearchParams.toString();
    navigate(queryString ? `/?${queryString}` : '/');
    setIsDrawerOpen(false);
  };

  /**
   * Toggles the visibility of the navigation drawer.
   * This is called when the menu icon in the NavigationBar is clicked.
   */
  const handleMenuClick = useCallback(() => {
    setIsDrawerOpen(prev => !prev);
  }, []);

  /**
   * Handles the ADD button click from the NavigationBar.
   * Navigates to the Add Payment page.
   */
  const handleAddClick = useCallback(() => {
    navigate('/add');
    setIsDrawerOpen(false);
  }, [navigate]);

  /**
   * Handles the Logout button click from the NavigationBar.
   * Clears auth state and redirects to login.
   */
  const handleLogout = useCallback(() => {
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  /**
   * A simple placeholder component for the navigation drawer.
   * In a real application, this would be a more robust and styled component,
   * potentially using a UI library or custom styling.
   * It provides links to different parts of the application.
   */
  const NavigationDrawer = () => (
    <div style={{ // Basic inline styles for demonstration
      position: 'fixed',
      top: 0,
      left: isDrawerOpen ? 0 : '-300px',
      width: '300px',
      height: '100%',
      background: '#222',
      color: 'white',
      padding: '20px',
      transition: 'left 0.3s ease',
      zIndex: 1000, // Ensure it's above other content
      borderRight: '1px solid #444'
    }}>
      <h3>Menu</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        <li style={{ marginBottom: '10px' }}><button onClick={() => { navigate('/'); setIsDrawerOpen(false); }}>Summary</button></li>
        <li style={{ marginBottom: '10px' }}><button onClick={() => { navigate('/add'); setIsDrawerOpen(false); }}>Add Payment</button></li>
        <li style={{ marginBottom: '10px' }}><button onClick={() => { navigate('/categories'); setIsDrawerOpen(false); }}>Categories</button></li>
        <li style={{ marginBottom: '10px' }}><button onClick={() => { navigate('/category-types'); setIsDrawerOpen(false); }}>Category Types</button></li>
        {/* Add more links as needed, e.g., Settings */}
      </ul>
    </div>
  );


  // ── Loading state while auth is being initialized ────────────────
  if (isLoading) {
    return <LoadingScreen>Loading…</LoadingScreen>;
  }

  // ── Unauthenticated: show login only ─────────────────────────────
  if (!token) {
    return (
      <Suspense fallback={<LoadingScreen>Loading…</LoadingScreen>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    );
  }

  // ── Authenticated: full app ──────────────────────────────────────
  return (
    <Wrapper>
      <NavigationBar
        active={currentFilter}
        onChange={handleGlobalNavFilterChange}
        onMenu={handleMenuClick}
        onAdd={handleAddClick}
        onLogout={handleLogout}
      />
      <NavigationDrawer />

      <Content onClick={() => { if (isDrawerOpen) setIsDrawerOpen(false); }}> {/* Close drawer on content click */}
        <Suspense fallback={<p>Loading page content…</p>}> {/* Fallback UI during lazy load */}
          <Routes>
            {/* Main route for the payment summary */}
            <Route path="/" element={<SummaryPage />} />

            {/* Routes for creating and editing payment items */}
            <Route path="/add" element={<AddItemPage />} />
            <Route path="/add-success" element={<AddSuccessPage />} />
            <Route path="/payment/new" element={<AddItemPage />} />
            <Route path="/payment/:id/edit" element={<EditItemPage />} />

            {/* Route for managing categories */}
            <Route path="/categories" element={<CategoryEditPage />} />
            <Route path="/category-types" element={<CategoryManagerPage />} />
            <Route path="/statistics" element={<StatisticsPage />} />

            {/* Redirect /login to home when already authenticated */}
            <Route path="/login" element={<Navigate to="/" replace />} />

            {/* Fallback routes for 404 and unmatched paths */}
            <Route path="/404" element={<NotFoundPage />} />
            <Route path="*" element={<Navigate to="/404" replace />} /> {/* Redirect any unmatched path to 404 */}
          </Routes>
        </Suspense>
      </Content>
    </Wrapper>
  );
};

export default App;
