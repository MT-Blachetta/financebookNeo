/**
 * Fallback 404 page for unknown routes.
 */

import React from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';

const Wrapper = styled.section`
  display: grid;
  place-items: center;
  text-align: center;
  padding: var(--spacing-lg);
  min-height: 60vh;
`;

const Code = styled.h2`
  font-size: 4rem;
  margin-bottom: var(--spacing-sm);
  color: var(--color-negative);
`;

const Message = styled.p`
  font-size: 1.1rem;
  margin-bottom: var(--spacing-md);
  color: var(--color-text-secondary);
`;

const NotFoundPage: React.FC = () => (
  <Wrapper>
    <div>
      <Code>404</Code>
      <Message>Sorry, the page you’re looking for doesn’t exist.</Message>
      <Link to="/">Back to Dashboard</Link>
    </div>
  </Wrapper>
);

export default NotFoundPage;