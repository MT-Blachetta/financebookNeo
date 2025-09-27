/**
 * AddItemPage Component
 *
 * This page provides a user interface for adding a new payment item.
 * It uses the customer-specified PaymentItemForm component which handles
 * all form logic, submission, and navigation internally.
 */
import React from 'react';
import { PaymentItemForm } from '../components/PaymentItemForm';

const AddItemPage: React.FC = () => {
  return <PaymentItemForm />;
};

export default AddItemPage;
