/**
 * EditItemPage Component
 *
 * This page allows users to edit an existing payment item.
 * It fetches the payment item's data based on the ID from the URL parameters,
 * pre-fills the 'PaymentItemForm' with this data, and handles the update submission.
 *
 * Features:
 * - Retrieves item ID from URL parameters.
 * - Fetches payment item data using 'usePaymentItem' hook.
 * - Displays loading and error states during data fetching.
 * - Renders 'PaymentItemForm' pre-filled with the fetched item data.
 * - Handles form submission using 'useUpdatePaymentItem' mutation.
 * - Navigates to the home/summary page upon successful item update.
 * - Displays submission status (loading/error) through props passed to 'PaymentItemForm'.
 */
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { PaymentItemForm } from '../components/PaymentItemForm';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import { usePaymentItem, useUpdatePaymentItem, useDeletePaymentItem } from '../api/hooks';
import { PaymentItem, PaymentItemFormData } from '../types';

const PageWrapper = styled.div`
  padding: 1rem;
  /* Add more styles as needed for page layout */
`;

const LoadingMessage = styled.p`
  color: #ccc;
  text-align: center;
  padding: 2rem;
`;

const ErrorMessage = styled.p`
  color: red;
  text-align: center;
  padding: 2rem;
`;

const ButtonContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1.5rem;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
  padding: 0 2rem;
`;

const DeleteButton = styled.button`
  width: 100%;
  padding: 1rem;
  font-size: 1.1rem;
  font-weight: bold;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-negative);
  color: white;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover:not(:disabled) {
    background: #dc2626;
  }

  &:disabled {
    background: #666;
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

const EditItemPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>(); // get the item ID from the URL
  const itemId = id ? parseInt(id, 10) : undefined;

  // state for confirmation dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // fetch the payment item data
  const { data: paymentItem, isLoading: isLoadingItem, isError: isFetchError, error: fetchError } = usePaymentItem(itemId);
  const updatePaymentItemMutation = useUpdatePaymentItem();
  const deletePaymentItemMutation = useDeletePaymentItem();

  /**
   * Handles the submission of the updated payment item form.
   * Calls the updatePaymentItem mutation and navigates on success.
   * @param data - The form data, conforming to the PaymentItemFormData type.
   */
  const handleSubmit = async (data: PaymentItemFormData) => {
    if (typeof data.id !== 'number') {
      console.error("handleSubmit in EditItemPage received data without a valid ID. Cannot update.");
      return;
    }
    try {
      await updatePaymentItemMutation.mutateAsync(data as { id: number; [key: string]: any; });
      navigate('/'); // navigate to summary page on success
    } catch (error) {
      // Error logging is useful for development.
      // The 'isError' and 'error' properties of the mutation are used to display errors in the form.
      console.error('Failed to update payment item:', error);
    }
  };

  /**
   * Handles the deletion of the payment item.
   * Shows confirmation dialog first, then deletes the item and navigates back.
   */
  const handleDelete = async () => {
    if (!itemId) {
      console.error("Cannot delete: No item ID available");
      return;
    }

    try {
      await deletePaymentItemMutation.mutateAsync(itemId);
      navigate('/'); // navigate to summary page on success
    } catch (error) {
      console.error('Failed to delete payment item:', error);
      // error handling could be improved with a toast notification
    } finally {
      setShowDeleteDialog(false);
    }
  };

  // display loading state while fetching item data
  if (isLoadingItem) {
    return <PageWrapper><LoadingMessage>Loading payment item...</LoadingMessage></PageWrapper>;
  }

  // display error message if fetching failed or item not found
  if (isFetchError || !paymentItem) {
    return (
      <PageWrapper>
        <ErrorMessage>
          Failed to load payment item: {fetchError?.message || (itemId ? 'Item was not found.' : 'No item ID was provided.')}
        </ErrorMessage>
      </PageWrapper>
    );
  }

  // render the form once data is available
  return (
    <PageWrapper>
      <PaymentItemForm
        initialData={paymentItem} // pre-fill form with existing item data
        onSubmit={handleSubmit}
        isSubmitting={updatePaymentItemMutation.isPending} // changed from isLoading to isPending
        // provide a user-friendly error message from the mutation state
        submitError={updatePaymentItemMutation.isError ? (updatePaymentItemMutation.error as Error)?.message || 'An unknown error occurred while updating the item.' : null}
      />
      
      <ButtonContainer>
        <DeleteButton
          type="button"
          onClick={() => setShowDeleteDialog(true)}
          disabled={deletePaymentItemMutation.isPending}
        >
          {deletePaymentItemMutation.isPending ? 'Deleting...' : 'Delete'}
        </DeleteButton>
      </ButtonContainer>

      <ConfirmationDialog
        isOpen={showDeleteDialog}
        title="Delete Payment"
        message={`Are you sure you want to delete this payment? This action cannot be undone. The payment item and any associated invoice documents will be permanently deleted.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        isLoading={deletePaymentItemMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </PageWrapper>
  );
};

export default EditItemPage;