import React, { useContext } from 'react';
import styled from 'styled-components';
import { PaginationContext } from '../pages/SummaryPage';

// Footer container - similar to NavigationBar but at the bottom
const FooterContainer = styled.footer`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #1a1a1a;
  border-top: 1px solid #333;
  padding: 0.75rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 100;
  min-height: 60px;
`;

// Left side controls (show button + input + ALL button)
const PaginationLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

// Right side controls (page info + previous/next buttons)
const PaginationRight = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

// Pagination button styling
const PaginationButton = styled.button<{ $disabled?: boolean }>`
  background: ${({ $disabled }) => ($disabled ? '#555' : '#007bff')};
  color: ${({ $disabled }) => ($disabled ? '#888' : 'white')};
  border: none;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  font-size: 0.9rem;
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  transition: background-color 0.2s ease;

  &:hover {
    background: ${({ $disabled }) => ($disabled ? '#555' : '#0056b3')};
  }
`;

// ALL button styling (black button)
const AllButton = styled.button`
  background: #000;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  font-size: 0.9rem;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover {
    background: #333;
  }
`;

// Number input for items per page
const PaginationInput = styled.input`
  width: 60px;
  padding: 0.5rem;
  background-color: #333;
  color: #eaeaea;
  border: 1px solid #555;
  border-radius: var(--radius-md);
  font-size: 0.9rem;
  text-align: center;

  &:focus {
    outline: none;
    border-color: #007bff;
  }

  /* Remove spinner arrows */
  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  -moz-appearance: textfield;
`;

// Page info text
const PageInfo = styled.span`
  color: #aaa;
  font-size: 0.9rem;
`;

export const Footer: React.FC = () => {
  const paginationState = useContext(PaginationContext);

  // Don't render footer if no pagination state (not on summary page) or if loading
  if (!paginationState || paginationState.isLoading || paginationState.totalItems === 0) {
    return null;
  }

  const {
    currentPage,
    totalPages,
    totalItems,
    inputValue,
    setInputValue,
    handleShowClick,
    handlePreviousPage,
    handleNextPage,
    handleAllClick,
    handleInputKeyPress,
  } = paginationState;

  return (
    <FooterContainer>
      <PaginationLeft>
        <PaginationButton onClick={handleShowClick}>
          Show
        </PaginationButton>
        <PaginationInput
          type="number"
          min="1"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleInputKeyPress}
          onFocus={(e) => e.target.select()}
          aria-label="Items per page"
        />
        <AllButton onClick={handleAllClick}>
          ALL
        </AllButton>
      </PaginationLeft>

      <PaginationRight>
        <PageInfo>
          Page {currentPage + 1} of {totalPages} ({totalItems} total)
        </PageInfo>
        <PaginationButton
          onClick={handlePreviousPage}
          $disabled={currentPage === 0}
          disabled={currentPage === 0}
          aria-label="Previous page"
        >
          Previous
        </PaginationButton>
        <PaginationButton
          onClick={handleNextPage}
          $disabled={currentPage >= totalPages - 1}
          disabled={currentPage >= totalPages - 1}
          aria-label="Next page"
        >
          Next
        </PaginationButton>
      </PaginationRight>
    </FooterContainer>
  );
};