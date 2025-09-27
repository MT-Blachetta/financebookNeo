/**
 * ConfirmationDialog Component
 * 
 * A professional confirmation dialog overlay that matches the app's design system.
 * Features:
 * - Modal overlay with backdrop blur
 * - Accessible with focus management
 * - Customizable title, message, and action buttons
 * - Proper keyboard navigation (ESC to close)
 */
import React, { useEffect, useRef } from 'react';
import styled, { keyframes } from 'styled-components';

// Animation keyframes
const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

const slideIn = keyframes`
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
`;

// Styled components
const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: ${fadeIn} 0.2s ease-out;
`;

const DialogContainer = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--color-surface, #1c1c1c);
  border: 1px solid #333;
  border-radius: var(--radius-lg, 0.75rem);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 400px;
  animation: ${slideIn} 0.2s ease-out;
`;

const DialogHeader = styled.div`
  padding: 1.5rem 1.5rem 1rem;
  border-bottom: 1px solid #333;
`;

const DialogTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary, #eaeaea);
  margin: 0;
`;

const DialogBody = styled.div`
  padding: 1.5rem;
`;

const DialogMessage = styled.p`
  color: var(--color-text-secondary, #9e9e9e);
  line-height: 1.5;
  margin: 0;
`;

const DialogFooter = styled.div`
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  padding: 1rem 1.5rem 1.5rem;
  border-top: 1px solid #333;
`;

const DialogButton = styled.button<{ variant?: 'primary' | 'danger' | 'secondary' }>`
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: var(--radius-md, 0.5rem);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 80px;
  
  ${props => {
    switch (props.variant) {
      case 'danger':
        return `
          background: var(--color-negative, #e74c3c);
          color: white;
          &:hover:not(:disabled) {
            background: #dc2626;
          }
        `;
      case 'primary':
        return `
          background: var(--color-positive, #2ecc71);
          color: white;
          &:hover:not(:disabled) {
            background: #059669;
          }
        `;
      case 'secondary':
      default:
        return `
          background: #444;
          color: var(--color-text-primary, #eaeaea);
          border: 1px solid #555;
          &:hover:not(:disabled) {
            background: #555;
          }
        `;
    }
  }}
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  &:focus {
    outline: 2px solid var(--color-positive, #2ecc71);
    outline-offset: 2px;
  }
`;

// Component props interface
interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'primary' | 'danger';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'primary',
  isLoading = false,
  onConfirm,
  onCancel,
}): JSX.Element | null => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // handle keyboard events
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    // focus the confirm button when dialog opens
    if (confirmButtonRef.current) {
      confirmButtonRef.current.focus();
    }

    document.addEventListener('keydown', handleKeyDown);
    
    // prevent body scroll when dialog is open
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onCancel]);

  // handle overlay click
  const handleOverlayClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onCancel();
    }
  };

  if (!isOpen) return null;

  return (
    <Overlay onClick={handleOverlayClick}>
      <DialogContainer ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <DialogHeader>
          <DialogTitle id="dialog-title">{title}</DialogTitle>
        </DialogHeader>
        
        <DialogBody>
          <DialogMessage>{message}</DialogMessage>
        </DialogBody>
        
        <DialogFooter>
          <DialogButton
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelText}
          </DialogButton>
          <DialogButton
            ref={confirmButtonRef}
            type="button"
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : confirmText}
          </DialogButton>
        </DialogFooter>
      </DialogContainer>
    </Overlay>
  );
};