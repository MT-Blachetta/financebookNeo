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
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { isAxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Recipient, Category, PaymentItemFormData, PaymentItem } from '../types';
import {
  useRecipients,
  useCategoriesByType,
  useCreatePaymentItem,
  useCreateRecipient,
  useUpdateRecipient,
  useCreateCategory,
  useUploadInvoice,
  useDeleteInvoice,
} from '../api/hooks';
import { ConfirmationDialog } from './ConfirmationDialog';
import {
  CATEGORY_NAME_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  RECIPIENT_ADDRESS_MAX_LENGTH,
  RECIPIENT_NAME_MAX_LENGTH,
} from '../constants/textLimits';

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

const DropdownContainer = styled.div`
  position: relative;
  margin-bottom: 1rem;
`;

const DropdownSearchInput = styled.input<{ disabled?: boolean }>`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #444;
  border-radius: var(--radius-md);
  background: ${props => (props.disabled ? '#2a2a2a' : '#333')};
  color: var(--color-text-primary);
  box-sizing: border-box;
  cursor: ${props => (props.disabled ? 'not-allowed' : 'text')};

  &:focus {
    outline: none;
    border-color: var(--color-positive);
  }
`;

const DropdownList = styled.ul`
  position: absolute;
  top: calc(100% + 0.25rem);
  left: 0;
  width: 100%;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #444;
  border-radius: var(--radius-md);
  background: #2a2a2a;
  list-style: none;
  margin: 0;
  padding: 0.25rem 0;
  z-index: 10;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
`;

const DropdownOption = styled.li<{ isSelected?: boolean }>`
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  background: ${props => (props.isSelected ? '#3a3a3a' : 'transparent')};
  color: var(--color-text-primary);

  &:hover {
    background: #444;
  }
`;

const DropdownMessage = styled.li`
  padding: 0.5rem 0.75rem;
  color: var(--color-text-secondary);
`;

const normalizeWhitespace = (value: string): string => value.trim().replace(/\s+/g, ' ');

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
  const [isRecipientDropdownOpen, setIsRecipientDropdownOpen] = useState<boolean>(false);
  const [recipientSearchTerm, setRecipientSearchTerm] = useState<string>('');

  const recipientDropdownRef = useRef<HTMLDivElement | null>(null);

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
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState<boolean>(false);
  const [categorySearchTerm, setCategorySearchTerm] = useState<string>('');

  const categoryDropdownRef = useRef<HTMLDivElement | null>(null);
  
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
  const updateRecipientMutation = useUpdateRecipient();
  const createCategoryMutation = useCreateCategory();
  const uploadInvoiceMutation = useUploadInvoice();
  const deleteInvoiceMutation = useDeleteInvoice();

  const availableCategories = useMemo(
    () => (categories ?? []).filter((cat) => cat.name !== 'UNCLASSIFIED'),
    [categories]
  );

  const filteredRecipients = useMemo(() => {
    const term = recipientSearchTerm.trim().toLowerCase();
    if (!recipients) return [] as Recipient[];
    if (!term) return recipients;
    return recipients.filter((recipient) =>
      recipient.name.toLowerCase().startsWith(term)
    );
  }, [recipients, recipientSearchTerm]);

  const filteredCategories = useMemo(() => {
    const term = categorySearchTerm.trim().toLowerCase();
    if (!term) return availableCategories;
    return availableCategories.filter((category) =>
      category.name.toLowerCase().startsWith(term)
    );
  }, [availableCategories, categorySearchTerm]);

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        recipientDropdownRef.current &&
        !recipientDropdownRef.current.contains(event.target as Node)
      ) {
        setIsRecipientDropdownOpen(false);
      }

      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCategoryDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (selectedRecipientId && recipients) {
      const recipient = recipients.find((r) => r.id.toString() === selectedRecipientId);
      if (recipient) {
        setRecipientSearchTerm(recipient.name);
        setRecipientName((prev) => (prev ? prev : recipient.name));
        setRecipientAddress((prev) => (prev ? prev : recipient.address || ''));
      }
    } else if (!selectedRecipientId) {
      setRecipientSearchTerm('');
    }
  }, [selectedRecipientId, recipients]);

  useEffect(() => {
    if (selectedCategoryId) {
      const category = availableCategories.find(
        (cat) => cat.id.toString() === selectedCategoryId
      );
      if (category) {
        setCategorySearchTerm(category.name);
      }
    } else {
      setCategorySearchTerm('');
    }
  }, [selectedCategoryId, availableCategories]);

  // handle recipient selection from dropdown
  const handleRecipientSelect = (recipientId: string) => {
    setSelectedRecipientId(recipientId);
    setRecipientModified(false);

    if (recipientId && recipients) {
      const recipient = recipients.find(r => r.id.toString() === recipientId);
      if (recipient) {
        setRecipientName(recipient.name);
        setRecipientAddress(recipient.address || '');
        setRecipientSearchTerm(recipient.name);
      }
    } else {
      setRecipientName('');
      setRecipientAddress('');
      setRecipientSearchTerm('');
    }

    setIsRecipientDropdownOpen(false);
  };

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategoryId(categoryId);

    if (categoryId) {
      const category = availableCategories.find(
        (cat) => cat.id.toString() === categoryId
      );
      if (category) {
        setCategorySearchTerm(category.name);
      }
    } else {
      setCategorySearchTerm('');
    }

    setIsCategoryDropdownOpen(false);
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
    const sanitizedName = normalizeWhitespace(recipientName);
    if (!sanitizedName) {
      setError('Recipient name is required');
      return;
    }

    // check for semicolons in recipient fields
    if (recipientName.includes(';') || recipientAddress.includes(';')) {
      setShowSemicolonDialog(true);
      return;
    }

    const trimmedAddressValue = recipientAddress.trim();
    const addressPayload = trimmedAddressValue ? trimmedAddressValue : null;

    // if a recipient is selected, update it instead of creating a duplicate
    if (selectedRecipientId) {
      try {
        const updatedRecipient = await updateRecipientMutation.mutateAsync({
          id: Number(selectedRecipientId),
          name: sanitizedName,
          address: addressPayload,
        });

        setRecipientName(updatedRecipient.name);
        setRecipientAddress(updatedRecipient.address ?? '');
        setRecipientSearchTerm(updatedRecipient.name);
        setRecipientModified(false);
        setIsRecipientDropdownOpen(false);
        setError(null);
      } catch (error) {
        console.error('Error updating recipient:', error);
        if (isAxiosError(error) && error.response?.data?.detail) {
          setError(String(error.response.data.detail));
        } else {
          setError('Failed to update recipient. Please try again.');
        }
      }
      return;
    }

    // prevent creating duplicates by comparing normalized names
    const duplicateRecipient = recipients?.find(
      (existing) => normalizeWhitespace(existing.name) === sanitizedName
    );

    if (duplicateRecipient) {
      setError('Recipient name already exists. Select it to update instead.');
      setSelectedRecipientId(duplicateRecipient.id.toString());
      setRecipientName(duplicateRecipient.name);
      setRecipientAddress(
        trimmedAddressValue
          ? trimmedAddressValue
          : duplicateRecipient.address ?? ''
      );
      setRecipientSearchTerm(duplicateRecipient.name);
      setIsRecipientDropdownOpen(false);
      return;
    }

    try {
      const newRecipient = await createRecipientMutation.mutateAsync({
        name: sanitizedName,
        address: addressPayload,
      });

      // select the newly created recipient
      setSelectedRecipientId(newRecipient.id.toString());
      setRecipientName(newRecipient.name);
      setRecipientAddress(newRecipient.address ?? '');
      setRecipientModified(false);
      setRecipientSearchTerm(newRecipient.name);
      setIsRecipientDropdownOpen(false);
      setError(null);

    } catch (error) {
      console.error('Error creating recipient:', error);
      if (isAxiosError(error) && error.response?.data?.detail) {
        setError(String(error.response.data.detail));
      } else {
        setError('Failed to create recipient. Please try again.');
      }
    }
  };

  // create a new category immediately and select it
  const handleAddCategory = async () => {
    const sanitizedName = normalizeWhitespace(newCategoryName);
    if (!sanitizedName) return;

    // check for semicolons in category name
    if (sanitizedName.includes(';')) {
      setShowSemicolonDialog(true);
      return;
    }

    const duplicateCategory = availableCategories.find(
      (category) => normalizeWhitespace(category.name) === sanitizedName
    );

    if (duplicateCategory) {
      setError('Category name already exists. Select it instead.');
      setSelectedCategoryId(duplicateCategory.id.toString());
      setCategorySearchTerm(duplicateCategory.name);
      setNewCategoryName('');
      setIsCategoryDropdownOpen(false);
      return;
    }

    try {
      const newCat = await createCategoryMutation.mutateAsync({
        name: sanitizedName,
        type_id: 1, // default category type
        parent_id: null,
      });
      setSelectedCategoryId(newCat.id.toString());
      setCategorySearchTerm(newCat.name);
      setIsCategoryDropdownOpen(false);
      setNewCategoryName('');
      setError(null);
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
            maxLength={DESCRIPTION_MAX_LENGTH}
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
            <DropdownContainer ref={recipientDropdownRef}>
              <DropdownSearchInput
                type="text"
                placeholder={
                  loadingRecipients ? 'Loading recipients...' : 'Search recipient...'
                }
                value={recipientSearchTerm}
                onChange={(e) => {
                  setRecipientSearchTerm(e.target.value);
                  if (!loadingRecipients) {
                    setIsRecipientDropdownOpen(true);
                  }
                }}
                onFocus={() => {
                  if (!loadingRecipients) {
                    setIsRecipientDropdownOpen(true);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setIsRecipientDropdownOpen(false);
                  }

                  if (event.key === 'Enter') {
                    event.preventDefault();
                    if (!recipientSearchTerm.trim()) {
                      handleRecipientSelect('');
                    } else if (filteredRecipients.length > 0) {
                      handleRecipientSelect(filteredRecipients[0].id.toString());
                    }
                  }
                }}
                maxLength={RECIPIENT_NAME_MAX_LENGTH}
                disabled={loadingRecipients}
              />
              {isRecipientDropdownOpen && (
                <DropdownList>
                  {loadingRecipients ? (
                    <DropdownMessage>Loading recipients...</DropdownMessage>
                  ) : (
                    <>
                      <DropdownOption
                        isSelected={selectedRecipientId === ''}
                        onMouseDown={() => handleRecipientSelect('')}
                      >
                        -- Select Recipient (Optional) --
                      </DropdownOption>
                      {filteredRecipients.length > 0 ? (
                        filteredRecipients.map((recipient) => (
                          <DropdownOption
                            key={recipient.id}
                            isSelected={selectedRecipientId === recipient.id.toString()}
                            onMouseDown={() => handleRecipientSelect(recipient.id.toString())}
                          >
                            {recipient.name}
                          </DropdownOption>
                        ))
                      ) : (
                        <DropdownMessage>No matching recipients</DropdownMessage>
                      )}
                    </>
                  )}
                </DropdownList>
              )}
            </DropdownContainer>

            <RecipientInput
              type="text"
              placeholder="Name"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              maxLength={RECIPIENT_NAME_MAX_LENGTH}
            />

            <RecipientInput
              type="text"
              placeholder="Address"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              maxLength={RECIPIENT_ADDRESS_MAX_LENGTH}
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
            <DropdownContainer ref={categoryDropdownRef}>
              <DropdownSearchInput
                type="text"
                placeholder={
                  loadingCategories ? 'Loading categories...' : 'Search category...'
                }
                value={categorySearchTerm}
                onChange={(e) => {
                  setCategorySearchTerm(e.target.value);
                  if (!loadingCategories) {
                    setIsCategoryDropdownOpen(true);
                  }
                }}
                onFocus={() => {
                  if (!loadingCategories) {
                    setIsCategoryDropdownOpen(true);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setIsCategoryDropdownOpen(false);
                  }

                  if (event.key === 'Enter') {
                    event.preventDefault();
                    if (!categorySearchTerm.trim()) {
                      handleCategorySelect('');
                    } else if (filteredCategories.length > 0) {
                      handleCategorySelect(filteredCategories[0].id.toString());
                    }
                  }
                }}
                maxLength={CATEGORY_NAME_MAX_LENGTH}
                disabled={loadingCategories}
              />
              {isCategoryDropdownOpen && (
                <DropdownList>
                  {loadingCategories ? (
                    <DropdownMessage>Loading categories...</DropdownMessage>
                  ) : (
                    <>
                      <DropdownOption
                        isSelected={selectedCategoryId === ''}
                        onMouseDown={() => handleCategorySelect('')}
                      >
                        -- Select Category (Optional) --
                      </DropdownOption>
                      {filteredCategories.length > 0 ? (
                        filteredCategories.map((category) => (
                          <DropdownOption
                            key={category.id}
                            isSelected={selectedCategoryId === category.id.toString()}
                            onMouseDown={() => handleCategorySelect(category.id.toString())}
                          >
                            {category.name}
                          </DropdownOption>
                        ))
                      ) : (
                        <DropdownMessage>No matching categories</DropdownMessage>
                      )}
                    </>
                  )}
                </DropdownList>
              )}
            </DropdownContainer>

            <CategoryInputContainer>
              <CategoryInput
                type="text"
                placeholder="Add new category"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                maxLength={CATEGORY_NAME_MAX_LENGTH}
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
