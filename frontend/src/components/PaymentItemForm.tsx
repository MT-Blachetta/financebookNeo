/**
 * PaymentItemForm Component - Customer Specification Implementation
 *
 * This component implements the exact specifications provided by the customer:
 * - Amount field with +/- toggle switch for income/expense
 * - Automatic timestamp generation on submit
 * - Recipient management with create/update functionality
 * - Category management with "standard" type and add functionality
 * - Periodic checkbox
 * - Success/error page navigation
 * 
 * The customer specifically requested to omit file upload functionality.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Recipient, Category, PaymentItemFormData, PaymentItem } from '../types';
import {
  useRecipients,
  useCategoriesByType,
  useCreatePaymentItem,
  useCreateRecipient,
  useCreateCategory,
  useUploadInvoice,
  useDeleteInvoice,
} from '../api/hooks';
import { ConfirmationDialog } from './ConfirmationDialog';

// styled components for customer-specified UI
const FormContainer = styled.div`
  padding: 2rem;
  max-width: 600px;
  margin: 0 auto;
  background: var(--color-background);
  color: var(--color-text-primary);
`;

const PageTitle = styled.h1`
  font-size: 1.5rem;
  margin-bottom: 2rem;
  text-align: center;
  color: var(--color-text-primary);
`;

const FormField = styled.div`
  margin-bottom: 1.5rem;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  color: var(--color-text-secondary);
`;

// amount input field - only accepts pure digits/numbers
const AmountInput = styled.input`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #444;
  border-radius: var(--radius-md);
  background: #2a2a2a;
  color: var(--color-text-primary);
  font-size: 1rem;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: var(--color-positive);
  }
`;

// toggle switch for +/- (Income/Expense)
const ToggleSwitch = styled.div`
  display: flex;
  width: 100%;
  height: 50px;
  border-radius: 25px;
  overflow: hidden;
  margin-top: 0.5rem;
`;

const ToggleHalf = styled.button<{ active: boolean; isPositive: boolean }>`
  flex: 1;
  border: none;
  font-size: 1.2rem;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.2s ease;
  
  background-color: ${props => 
    props.active 
      ? (props.isPositive ? 'var(--color-positive)' : 'var(--color-negative)')
      : '#666'
  };
  
  color: ${props => props.active ? 'white' : '#ccc'};

  &:hover {
    background-color: ${props => 
      props.active 
        ? (props.isPositive ? '#059669' : '#dc2626')
        : '#777'
    };
  }
`;

// checkbox for periodic payments
const CheckboxContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const Checkbox = styled.input`
  width: 18px;
  height: 18px;
`;

// description textarea for payment description
const DescriptionTextarea = styled.textarea`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #444;
  border-radius: var(--radius-md);
  background: #2a2a2a;
  color: var(--color-text-primary);
  min-height: 80px;
  resize: vertical;
  box-sizing: border-box;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: var(--color-positive);
  }
`;

// recipient management area
const RecipientArea = styled.div`
  background: #2a2a2a;
  border-radius: var(--radius-md);
  padding: 1rem;
  border: 1px solid #444;
`;

const RecipientDropdown = styled.select`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #444;
  border-radius: var(--radius-md);
  background: #333;
  color: var(--color-text-primary);
  margin-bottom: 1rem;
`;

const RecipientInput = styled.input`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #444;
  border-radius: var(--radius-md);
  background: #333;
  color: var(--color-text-primary);
  margin-bottom: 0.5rem;
  box-sizing: border-box;
`;

const AddRecipientButton = styled.button`
  width: 100%;
  padding: 0.75rem 1rem;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-positive);
  color: white;
  cursor: pointer;
  transition: background-color 0.2s ease;
  margin-top: 0.5rem;

  &:hover {
    background: #059669;
  }

  &:disabled {
    background: #666;
    cursor: not-allowed;
  }
`;

// category management area
const CategoryArea = styled.div`
  background: #2a2a2a;
  border-radius: var(--radius-md);
  padding: 1rem;
  border: 1px solid #444;
`;

const CategoryDropdown = styled.select`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #444;
  border-radius: var(--radius-md);
  background: #333;
  color: var(--color-text-primary);
  margin-bottom: 1rem;
`;

const CategoryInputContainer = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
`;

const CategoryInput = styled.input`
  flex: 1;
  padding: 0.75rem;
  border: 1px solid #444;
  border-radius: var(--radius-md);
  background: #333;
  color: var(--color-text-primary);
`;

const AddCategoryButton = styled.button`
  padding: 0.75rem 1rem;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-positive);
  color: white;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover {
    background: #059669;
  }

  &:disabled {
    background: #666;
    cursor: not-allowed;
  }
`;

// Submit button
const SubmitButton = styled.button`
  width: 100%;
  padding: 1rem;
  font-size: 1.1rem;
  font-weight: bold;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-positive);
  color: white;
  cursor: pointer;
  transition: background-color 0.2s ease;
  margin-top: 2rem;

  &:hover {
    background: #059669;
  }

  &:disabled {
    background: #666;
    cursor: not-allowed;
  }
`;

const ErrorMessage = styled.div`
  color: var(--color-negative);
  font-size: 0.9rem;
  margin-top: 0.5rem;
`;

// invoice upload area
const InvoiceUploadArea = styled.div`
  background: #2a2a2a;
  border-radius: var(--radius-md);
  padding: 1rem;
  border: 1px solid #444;
`;

const FileUploadContainer = styled.div<{ isDragOver: boolean; hasFile: boolean }>`
  border: 2px dashed ${props => props.isDragOver ? 'var(--color-positive)' : (props.hasFile ? 'var(--color-positive)' : '#666')};
  border-radius: var(--radius-md);
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  background: ${props => props.isDragOver ? 'rgba(46, 204, 113, 0.1)' : 'transparent'};

  &:hover {
    border-color: var(--color-positive);
    background: rgba(46, 204, 113, 0.05);
  }
`;

const FileUploadIcon = styled.div`
  font-size: 2rem;
  margin-bottom: 1rem;
  color: #888;
`;

const FileUploadText = styled.div`
  color: var(--color-text-secondary);
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
`;

const FileUploadSubtext = styled.div`
  color: #666;
  font-size: 0.8rem;
`;

const FileInfo = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #333;
  padding: 0.75rem;
  border-radius: var(--radius-md);
  margin-top: 1rem;
`;

const FileDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const FileName = styled.div`
  color: var(--color-text-primary);
  font-size: 0.9rem;
  font-weight: 500;
`;

const FileSize = styled.div`
  color: var(--color-text-secondary);
  font-size: 0.8rem;
`;

const FileActions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const FileActionButton = styled.button<{ variant?: 'danger' }>`
  padding: 0.5rem 0.75rem;
  border: none;
  border-radius: var(--radius-md);
  font-size: 0.8rem;
  cursor: pointer;
  transition: background-color 0.2s ease;
  
  background: ${props => props.variant === 'danger' ? 'var(--color-negative)' : '#555'};
  color: white;

  &:hover {
    background: ${props => props.variant === 'danger' ? '#dc2626' : '#666'};
  }

  &:disabled {
    background: #444;
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

const HiddenFileInput = styled.input`
  display: none;
`;

const UploadProgress = styled.div`
  margin-top: 1rem;
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 4px;
  background: #333;
  border-radius: 2px;
  overflow: hidden;
`;

const ProgressFill = styled.div<{ progress: number }>`
  height: 100%;
  background: var(--color-positive);
  width: ${props => props.progress}%;
  transition: width 0.3s ease;
`;

const ProgressText = styled.div`
  color: var(--color-text-secondary);
  font-size: 0.8rem;
  margin-top: 0.5rem;
  text-align: center;
`;

interface PaymentItemFormProps {
  initialData?: PaymentItem;
  onSubmit?: (data: PaymentItemFormData) => void | Promise<void>;
  isSubmitting?: boolean;
  submitError?: string | null;
}

export const PaymentItemForm: React.FC<PaymentItemFormProps> = ({
  initialData,
  onSubmit,
  isSubmitting = false,
  submitError,
}) => {
  const navigate = useNavigate();

  const isEditMode = Boolean(onSubmit && initialData);

  // form state
  const [amount, setAmount] = useState<string>(
    initialData ? Math.abs(initialData.amount).toString() : ''
  );
  const [isPositive, setIsPositive] = useState<boolean>(
    initialData ? initialData.amount >= 0 : true
  );
  const [periodic, setPeriodic] = useState<boolean>(initialData?.periodic ?? false);

  // payment description state
  const [paymentDescription, setPaymentDescription] = useState<string>(initialData?.description ?? '');

  // recipient state
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>(
    initialData?.recipient_id ? initialData.recipient_id.toString() : ''
  );
  const [recipientName, setRecipientName] = useState<string>('');
  const [recipientAddress, setRecipientAddress] = useState<string>('');
  const [recipientModified, setRecipientModified] = useState<boolean>(false);

  // category state - prioritize standard_category_id over categories array
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(() => {
    if (initialData?.standard_category_id) {
      return initialData.standard_category_id.toString();
    }
    if (initialData?.categories && initialData.categories[0]) {
      return initialData.categories[0].id.toString();
    }
    return '';
  });
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  
  // error state
  const [error, setError] = useState<string | null>(null);
  
  // semicolon validation dialog state
  const [showSemicolonDialog, setShowSemicolonDialog] = useState<boolean>(false);
  
  // invoice upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  
  // hooks
  const { data: recipients, isLoading: loadingRecipients, refetch: refetchRecipients } = useRecipients();
  const { data: categories, isLoading: loadingCategories } = useCategoriesByType(1); // Type ID 1 = "standard"
  const createPaymentMutation = useCreatePaymentItem();
  const createRecipientMutation = useCreateRecipient();
  const createCategoryMutation = useCreateCategory();
  const uploadInvoiceMutation = useUploadInvoice();
  const deleteInvoiceMutation = useDeleteInvoice();

  // when initialData is loaded asynchronously, populate form state
  useEffect(() => {
    if (!initialData) return;
    setAmount(Math.abs(initialData.amount).toString());
    setIsPositive(initialData.amount >= 0);
    setPeriodic(initialData.periodic);
    setPaymentDescription(initialData.description ?? '');
    setSelectedRecipientId(initialData.recipient_id ? initialData.recipient_id.toString() : '');
    
    // prioritize standard_category_id over categories array
    if (initialData.standard_category_id) {
      setSelectedCategoryId(initialData.standard_category_id.toString());
    } else if (initialData.categories && initialData.categories[0]) {
      setSelectedCategoryId(initialData.categories[0].id.toString());
    } else {
      setSelectedCategoryId('');
    }
  }, [initialData]);

  // handle recipient selection from dropdown
  const handleRecipientSelect = (recipientId: string) => {
    setSelectedRecipientId(recipientId);
    setRecipientModified(false);
    
    if (recipientId && recipients) {
      const recipient = recipients.find(r => r.id.toString() === recipientId);
      if (recipient) {
        setRecipientName(recipient.name);
        setRecipientAddress(recipient.address || '');
      }
    } else {
      setRecipientName('');
      setRecipientAddress('');
    }
  };

  // track recipient modifications
  useEffect(() => {
    if (selectedRecipientId && recipients) {
      const originalRecipient = recipients.find(r => r.id.toString() === selectedRecipientId);
      if (originalRecipient) {
        const nameChanged = recipientName !== originalRecipient.name;
        const addressChanged = recipientAddress !== (originalRecipient.address || '');
        
        setRecipientModified(nameChanged || addressChanged);
      }
    } else {
      setRecipientModified(recipientName.trim() !== '' || recipientAddress.trim() !== '');
    }
  }, [recipientName, recipientAddress, selectedRecipientId, recipients]);

  // handle recipient creation
  const handleAddRecipient = async () => {
    if (!recipientName.trim()) {
      setError('Recipient name is required');
      return;
    }

    // check for semicolons in recipient fields
    if (recipientName.includes(';') || recipientAddress.includes(';')) {
      setShowSemicolonDialog(true);
      return;
    }

    try {
      const newRecipient = await createRecipientMutation.mutateAsync({
        name: recipientName.trim(),
        address: recipientAddress.trim() || null,
      });
      
      // select the newly created recipient
      setSelectedRecipientId(newRecipient.id.toString());
      setRecipientModified(false);
      setError(null);
      
    } catch (error) {
      console.error('Error creating recipient:', error);
      setError('Failed to create recipient. Please try again.');
    }
  };

  // create a new category immediately and select it
  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    
    // check for semicolons in category name
    if (name.includes(';')) {
      setShowSemicolonDialog(true);
      return;
    }
    
    try {
      const newCat = await createCategoryMutation.mutateAsync({
        name,
        type_id: 1, // default category type
        parent_id: null,
      });
      setSelectedCategoryId(newCat.id.toString());
      setNewCategoryName('');
    } catch (err) {
      console.error('Error creating category:', err);
      setError('Failed to create category. Please try again.');
    }
  };

  // file upload handlers
  const validateFile = (file: File): string | null => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/tiff'
    ];

    if (!allowedTypes.includes(file.type)) {
      return 'File type not supported. Please upload PDF, DOCX, DOC, or image files.';
    }

    const maxSize = 25 * 1024 * 1024; // 25MB
    if (file.size > maxSize) {
      return 'File size exceeds 25MB limit.';
    }

    return null;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileSelect = (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSelectedFile(file);
    setError(null);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleUploadInvoice = async (fileToUpload?: File) => {
    const file = fileToUpload || selectedFile;
    if (!file || !initialData?.id) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      await uploadInvoiceMutation.mutateAsync({
        paymentItemId: initialData.id,
        file: file,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);
      setSelectedFile(null);
      setError(null);

      // reset progress after a short delay
      setTimeout(() => {
        setUploadProgress(0);
        setIsUploading(false);
      }, 1000);
    } catch (error) {
      setIsUploading(false);
      setUploadProgress(0);
      console.error('Error uploading invoice:', error);
      setError('Failed to upload invoice. Please try again.');
    }
  };

  const handleDeleteInvoice = async () => {
    if (!initialData?.id) return;

    try {
      await deleteInvoiceMutation.mutateAsync(initialData.id);
      setError(null);
    } catch (error) {
      console.error('Error deleting invoice:', error);
      setError('Failed to delete invoice. Please try again.');
    }
  };

  const handleRemoveSelectedFile = () => {
    setSelectedFile(null);
    setError(null);
  };

  // semicolon validation function
  const validateSemicolons = (): boolean => {
    const fieldsToCheck = [
      { value: paymentDescription, name: 'Payment Description' },
      { value: recipientName, name: 'Recipient Name' },
      { value: recipientAddress, name: 'Recipient Address' },
      { value: newCategoryName, name: 'Category Name' }
    ];
    
    for (const field of fieldsToCheck) {
      if (field.value && field.value.includes(';')) {
        return false;
      }
    }
    return true;
  };

  // handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // check for semicolons first
    if (!validateSemicolons()) {
      setShowSemicolonDialog(true);
      return;
    }
    
    // validate amount
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setError('Please enter a valid amount greater than 0');
      return;
    }
    
    try {
      // build the payment data
      const paymentData: PaymentItemFormData = {
        amount: isPositive ? numericAmount : -numericAmount,
        date: isEditMode && initialData ? initialData.date : new Date().toISOString(),
        periodic,
        description: paymentDescription.trim() || null,
        recipient_id: null,
        category_ids: [],
        standard_category_id: null,
      };

      if (isEditMode && initialData?.id !== undefined) {
        paymentData.id = initialData.id;
      }
      
      // handle recipient assignment
      if (selectedRecipientId && !selectedRecipientId.startsWith('new:')) {
        paymentData.recipient_id = parseInt(selectedRecipientId);
      }
      
      // handle category selection - set as standard_category_id for standard type categories
      if (selectedCategoryId) {
        const categoryId = parseInt(selectedCategoryId);
        paymentData.category_ids = [categoryId];
        paymentData.standard_category_id = categoryId; // Set as standard category
      }
      
      if (isEditMode && onSubmit) {
        // first update the payment item
        await onSubmit(paymentData);
        
        // then upload the selected file if there is one
        if (selectedFile && initialData?.id) {
          try {
            setIsUploading(true);
            setUploadProgress(0);
            
            // simulate progress for better UX
            const progressInterval = setInterval(() => {
              setUploadProgress(prev => Math.min(prev + 10, 90));
            }, 100);

            await uploadInvoiceMutation.mutateAsync({
              paymentItemId: initialData.id,
              file: selectedFile,
            });

            clearInterval(progressInterval);
            setUploadProgress(100);
            setSelectedFile(null);
            
            // reset progress after a short delay
            setTimeout(() => {
              setUploadProgress(0);
              setIsUploading(false);
            }, 1000);
          } catch (uploadError) {
            console.error('Error uploading invoice after payment update:', uploadError);
            setError('Payment updated successfully, but failed to upload invoice. You can try uploading it again.');
            setIsUploading(false);
            setUploadProgress(0);
          }
        }
      } else {
        // create the payment item first
        const createdPayment = await createPaymentMutation.mutateAsync(paymentData);
        
        // if there's a selected file, upload it after payment creation
        if (selectedFile && createdPayment.id) {
          try {
            setIsUploading(true);
            setUploadProgress(0);
            
            // simulate progress for better UX
            const progressInterval = setInterval(() => {
              setUploadProgress(prev => Math.min(prev + 10, 90));
            }, 100);

            await uploadInvoiceMutation.mutateAsync({
              paymentItemId: createdPayment.id,
              file: selectedFile,
            });

            clearInterval(progressInterval);
            setUploadProgress(100);
            
            // reset progress after a short delay
            setTimeout(() => {
              setUploadProgress(0);
              setIsUploading(false);
            }, 500);
          } catch (uploadError) {
            console.error('Error uploading invoice after payment creation:', uploadError);
            setError('Payment created successfully, but failed to upload invoice. You can upload it later by editing the payment.');
            setIsUploading(false);
            setUploadProgress(0);
          }
        }
        
        // navigate to success page
        navigate('/add-success');
      }
      
    } catch (error) {
      console.error('Error creating payment:', error);
      setError('Failed to submit payment. Please try again.');
    }
  };

  return (
    <FormContainer>
      <PageTitle>{isEditMode ? 'Edit Payment' : 'Add New Payment'}</PageTitle>
      
      <form onSubmit={handleSubmit}>
        {/* Amount Field with +/- Toggle */}
        <FormField>
          <Label>Amount (€)</Label>
          <AmountInput
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
          />
          <ToggleSwitch>
            <ToggleHalf
              type="button"
              active={isPositive}
              isPositive={true}
              onClick={() => setIsPositive(true)}
            >
              +
            </ToggleHalf>
            <ToggleHalf
              type="button"
              active={!isPositive}
              isPositive={false}
              onClick={() => setIsPositive(false)}
            >
              -
            </ToggleHalf>
          </ToggleSwitch>
        </FormField>

        {/* Payment Description */}
        <FormField>
          <Label>Payment Description</Label>
          <DescriptionTextarea
            placeholder="Describe what this payment is for..."
            value={paymentDescription}
            onChange={(e) => setPaymentDescription(e.target.value)}
          />
        </FormField>

        {/* Periodic Checkbox */}
        <FormField>
          <CheckboxContainer>
            <Checkbox
              type="checkbox"
              checked={periodic}
              onChange={(e) => setPeriodic(e.target.checked)}
            />
            <Label style={{ margin: 0 }}>Periodic Payment</Label>
          </CheckboxContainer>
        </FormField>

        {/* Recipient Management */}
        <FormField>
          <Label>Recipient</Label>
          <RecipientArea>
            <RecipientDropdown
              value={selectedRecipientId}
              onChange={(e) => handleRecipientSelect(e.target.value)}
              disabled={loadingRecipients}
            >
              <option value="">-- Select Recipient (Optional) --</option>
              {recipients?.map((recipient) => (
                <option key={recipient.id} value={recipient.id.toString()}>
                  {recipient.name}
                </option>
              ))}
            </RecipientDropdown>
            
            <RecipientInput
              type="text"
              placeholder="Name"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
            />
            
            <RecipientInput
              type="text"
              placeholder="Address"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
            />
            
            <AddRecipientButton
              type="button"
              onClick={handleAddRecipient}
              disabled={!recipientName.trim() || !recipientModified}
            >
              Add Recipient
            </AddRecipientButton>
          </RecipientArea>
        </FormField>

        {/* Category Management */}
        <FormField>
          <Label>Category</Label>
          <CategoryArea>
            <CategoryDropdown
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              disabled={loadingCategories}
            >
              <option value="">-- Select Category (Optional) --</option>
              {categories?.filter(cat => cat.name !== "UNCLASSIFIED").map((category) => (
                <option key={category.id} value={category.id.toString()}>
                  {category.name}
                </option>
              ))}
            </CategoryDropdown>
            
            <CategoryInputContainer>
              <CategoryInput
                type="text"
                placeholder="Add new category"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
              <AddCategoryButton
                type="button"
                onClick={handleAddCategory}
                disabled={!newCategoryName.trim()}
              >
                Add
              </AddCategoryButton>
            </CategoryInputContainer>
          </CategoryArea>
        </FormField>

        {/* Invoice Upload - Show in both add and edit modes */}
        <FormField>
          <Label>Invoice Document</Label>
          <InvoiceUploadArea>
            {/* Show current invoice status in edit mode */}
            {isEditMode && initialData && initialData.invoice_path && !selectedFile && (
              <FileInfo>
                <FileDetails>
                  <FileName>Invoice uploaded</FileName>
                  <FileSize>Click download to view file</FileSize>
                </FileDetails>
                <FileActions>
                  <FileActionButton
                    type="button"
                    onClick={() => window.open(`/api/download-invoice/${initialData.id}`, '_blank')}
                  >
                    Download
                  </FileActionButton>
                  <FileActionButton
                    type="button"
                    variant="danger"
                    onClick={handleDeleteInvoice}
                    disabled={deleteInvoiceMutation.isPending}
                  >
                    {deleteInvoiceMutation.isPending ? 'Deleting...' : 'Delete'}
                  </FileActionButton>
                </FileActions>
              </FileInfo>
            )}

            {/* File upload area */}
            {!isUploading && (
              <>
                <HiddenFileInput
                  ref={(input) => {
                    if (input) {
                      input.onclick = () => input.click();
                    }
                  }}
                  type="file"
                  accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.gif,.bmp,.tiff"
                  onChange={handleFileInputChange}
                />
                
                <FileUploadContainer
                  isDragOver={isDragOver}
                  hasFile={!!selectedFile}
                  onClick={() => (document.querySelector('input[type="file"]') as HTMLInputElement)?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <FileUploadIcon></FileUploadIcon>
                  <FileUploadText>
                    {selectedFile ?
                      (isEditMode ? 'File selected - will be uploaded when UPDATE is pressed' : 'File selected - will be uploaded after payment creation') :
                     (isEditMode && initialData?.invoice_path ? 'Drop a new file here or click to replace' :
                      'Drop your invoice here or click to browse')}
                  </FileUploadText>
                  <FileUploadSubtext>
                    Supports PDF, DOCX, DOC, and image files up to 25MB
                  </FileUploadSubtext>
                </FileUploadContainer>
              </>
            )}

            {/* Selected file info */}
            {selectedFile && !isUploading && (
              <FileInfo>
                <FileDetails>
                  <FileName>{selectedFile.name}</FileName>
                  <FileSize>{formatFileSize(selectedFile.size)}</FileSize>
                </FileDetails>
                <FileActions>
                  <FileActionButton
                    type="button"
                    variant="danger"
                    onClick={handleRemoveSelectedFile}
                  >
                    Remove
                  </FileActionButton>
                </FileActions>
              </FileInfo>
            )}

            {/* Upload progress */}
            {isUploading && (
              <UploadProgress>
                <ProgressBar>
                  <ProgressFill progress={uploadProgress} />
                </ProgressBar>
                <ProgressText>
                  Uploading... {uploadProgress}%
                </ProgressText>
              </UploadProgress>
            )}
          </InvoiceUploadArea>
        </FormField>

        {submitError && <ErrorMessage>{submitError}</ErrorMessage>}
        {error && <ErrorMessage>{error}</ErrorMessage>}

        {/* Submit Button */}
        <SubmitButton
          type="submit"
          disabled={(isEditMode ? isSubmitting : createPaymentMutation.isPending) || !amount}
        >
          {isEditMode
            ? isSubmitting ? 'Updating...' : 'Update'
            : createPaymentMutation.isPending ? 'Creating...' : 'Submit'}
        </SubmitButton>
      </form>

      {/* Semicolon validation dialog */}
      <ConfirmationDialog
        isOpen={showSemicolonDialog}
        title="Invalid Character"
        message="Semicolon (;) characters are not allowed in any input fields. Please remove them before submitting."
        confirmText="OK"
        confirmVariant="primary"
        onConfirm={() => setShowSemicolonDialog(false)}
        onCancel={() => setShowSemicolonDialog(false)}
      />
    </FormContainer>
  );
};
