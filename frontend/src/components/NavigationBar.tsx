/**
 * Persistent top-navigation bar.
 *
 * Responsibilities:
 * 
 * - Displays application title
 * - Provides quick filters (All, Expenses, Incomes) as described
 * - Offers a hamburger menu on small screens to open additional navigation
 * (future extensions: category editor, settings, etc.)
 *
 * The component is "presentational"; it receives the active filter and
 * callbacks via props. State-management lives higher up (e.g. in
 * 'SummaryPage.tsx') so other components can react to filter changes.
 */

import React from 'react';
import styled from 'styled-components';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import { PaymentItem } from '../types';
import { useImportCSV } from '../api/hooks';


/* Types & Props  */

export type ViewFilter = 'all' | 'expenses' | 'incomes';

interface NavigationBarProps {
  active: ViewFilter;
  onChange(filter: ViewFilter): void;

  /** Callback when user clicks the hamburger icon. */
  onMenu(): void;

  /** Optional callback when user clicks the ADD button. */
  onAdd?(): void;
}


/* Styled Components  */


const Bar = styled.header`
  background: var(--color-surface);
  padding: var(--spacing-sm) var(--spacing-md);
  display: flex;
  align-items: center;
  border-bottom: 1px solid #272727;
  position: relative; /* allow absolute positioning of Filters */
`;

const LeftSection = styled.div`
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
`;

const Title = styled.h1`
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary);
  letter-spacing: 0.02em;
`;

const Filters = styled.nav`
  display: flex;
  gap: var(--spacing-sm);
  position: absolute; /* center independently of siblings */
  left: 50%;
  transform: translateX(-50%);
  button {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    font-size: 0.9rem;
    cursor: pointer;
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-md);

    &.active {
      background: #333;
      color: var(--color-text-primary);
    }
  }

  @media (max-width: 480px) {
    display: none; /* collapse into menu on small viewports */
  }
`;


const CategoryEditButtons = styled.div`
  display: flex;
  gap: var(--spacing-sm);

  button {
    background: none;
    border: 1px solid #444; /* Add a subtle border to distinguish them */
    color: var(--color-text-secondary);
    font-size: 0.9rem;
    cursor: pointer;
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-md);
    transition: all 0.2s ease;

    &:hover {
      background: #333;
      color: var(--color-text-primary);
      border-color: #555;
    }
  }

  /* Hide on smaller screens to avoid clutter; these links are in the drawer */
  @media (max-width: 768px) {
    display: none;
  }
`;

const AddButton = styled.button`
  background: var(--color-positive);
  color: white;
  border: none;
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--radius-md);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover {
    background: #059669; /* Darker green on hover */
  }

  @media (max-width: 640px) {
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: 0.8rem;
  }
`;

const MenuButton = styled.button`
  display: none; /* hidden on desktop */
  background: transparent;
  border: none;
  padding: var(--spacing-xs);
  cursor: pointer;

  svg {
    width: 24px;
    height: 24px;
    fill: var(--color-text-primary);
  }

  @media (max-width: 480px) {
    display: block;
  }
`;

const RightSection = styled.div`
  display: flex;
  align-items: center;
  margin-left: auto;
  gap: var(--spacing-sm);
`;

const CSVButtons = styled.div`
  display: flex;
  gap: var(--spacing-sm);

  button {
    background: none;
    border: 1px solid #444;
    color: var(--color-text-secondary);
    font-size: 0.9rem;
    cursor: pointer;
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-md);
    transition: all 0.2s ease;

    &:hover {
      background: #333;
      color: var(--color-text-primary);
      border-color: #555;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  @media (max-width: 640px) {
    display: none;
  }
`;


/* Component  */


export const NavigationBar: React.FC<NavigationBarProps> = ({
  active,
  onChange,
  onMenu,
  onAdd,
}) => {
  const navigate = useNavigate();
  const importCsvMutation = useImportCSV();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleExportCSV = async () => {
    try {
      // fetch all payment items without any filters
      const response = await fetch('/api/payment-items');
      if (!response.ok) {
        throw new Error('Failed to fetch payment items');
      }
      const paymentItems: PaymentItem[] = await response.json();

      // sort by date (ascending)
      const sortedItems = paymentItems.sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      // create CSV content by fetching recipient and category data for each item
      const csvRows = await Promise.all(sortedItems.map(async (item) => {
        const amount = item.amount.toString();
        const date = new Date(item.date).toISOString().split('T')[0]; // YYYY-MM-DD format
        const description = item.description || '';
        const periodic = item.periodic ? 'true' : 'false';

        // fetch recipient data if recipient_id exists
        let recipientName = '';
        let recipientAddress = '';
        if (item.recipient_id) {
          try {
            const recipientResponse = await fetch(`/api/recipients/${item.recipient_id}`);
            if (recipientResponse.ok) {
              const recipient = await recipientResponse.json();
              recipientName = recipient.name || '';
              recipientAddress = recipient.address || '';
            }
          } catch (error) {
            console.warn(`Failed to fetch recipient ${item.recipient_id}:`, error);
          }
        }

        // fetch standard category data if standard_category_id exists
        let standardCategoryName = '';
        if (item.standard_category_id) {
          try {
            const categoryResponse = await fetch(`/api/categories/${item.standard_category_id}`);
            if (categoryResponse.ok) {
              const category = await categoryResponse.json();
              standardCategoryName = category.name || '';
            }
          } catch (error) {
            console.warn(`Failed to fetch category ${item.standard_category_id}:`, error);
          }
        }

        // Format: amount;date;description;Recipient name;Recipient address;standard_category name;periodic
        return [amount, date, description, recipientName, recipientAddress, standardCategoryName, periodic].join(';');
      }));

      // add header row
      const csvContent = 'amount;date;description;Recipient name;Recipient address;standard_category name;periodic\n' + csvRows.join('\n');

      // create blob and trigger download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `payment_items_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert('Failed to export CSV. Please try again.');
    }
  };

  const handleImportCSVClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      alert('Please select a CSV file that was exported from FinanceBook.');
      event.target.value = '';
      return;
    }

    try {
      const result = await importCsvMutation.mutateAsync(file);
      alert(
        `CSV import completed. Created ${result.created_payments} payments, ${result.created_recipients} recipients, updated ${result.updated_recipients} recipients, and created ${result.created_categories} categories.`
      );
    } catch (error: unknown) {
      console.error('Error importing CSV:', error);
      let message = 'Failed to import CSV. Please ensure the file matches the exported format.';
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: { detail?: string } } };
        const detail = axiosError.response?.data?.detail;
        if (typeof detail === 'string' && detail.trim().length > 0) {
          message = detail;
        }
      } else if (error instanceof Error && error.message) {
        message = error.message;
      }
      alert(message);
    } finally {
      event.target.value = '';
    }
  };

  return (
    <Bar>
      <LeftSection>
        <Title>FinanceBook</Title>
        <CategoryEditButtons>
          <button onClick={() => navigate('/categories')}>Categories</button>
          <button onClick={() => navigate('/category-types')}>Category Types</button>
        </CategoryEditButtons>
      </LeftSection>

      <Filters>
        <button
          className={clsx({ active: active === 'all' })}
          onClick={() => onChange('all')}
        >
          All
        </button>
        <button
          className={clsx({ active: active === 'expenses' })}
          onClick={() => onChange('expenses')}
        >
          Expenses
        </button>
        <button
          className={clsx({ active: active === 'incomes' })}
          onClick={() => onChange('incomes')}
        >
          Incomes
        </button>
      </Filters>

      <RightSection>
        <CSVButtons>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={handleImportFileChange}
          />
          <button type="button" onClick={handleImportCSVClick} disabled={importCsvMutation.isPending}>
            {importCsvMutation.isPending ? 'importing…' : 'import CSV'}
          </button>
          <button type="button" onClick={handleExportCSV}>export CSV</button>
        </CSVButtons>
        {onAdd && <AddButton onClick={onAdd}>ADD</AddButton>}
        <MenuButton aria-label="Open Menu" onClick={onMenu}>
        </MenuButton>
      </RightSection>
    </Bar>
  );
};
