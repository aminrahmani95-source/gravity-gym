import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  icon,
  children,
  maxWidth = 'sm',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  const titleId = title ? `modal-title-${Math.random().toString(36).substr(2, 9)}` : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in overscroll-contain"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`relative w-full ${maxWidthStyles[maxWidth]} rounded-3xl bg-[#15181B] p-6 sm:p-7 shadow-2xl animate-scale-up border border-[#272B30] text-[#F4F5F2]`}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="بستن"
          className="absolute left-4 top-4 rounded-full p-2 text-[#9CA3A8] hover:bg-[#1D2125] hover:text-[#F4F5F2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F500]/40 transition cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        {(title || icon) && (
          <div className="text-center mb-6">
            {icon && (
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#C8F500]/10 border border-[#C8F500]/20 text-[#C8F500] shadow-sm">
                {icon}
              </div>
            )}
            {title && <h3 id={titleId} className="text-lg font-bold text-[#F4F5F2] tracking-tight">{title}</h3>}
            {description && <p className="mt-1 text-xs text-[#9CA3A8] leading-relaxed">{description}</p>}
          </div>
        )}

        {/* Modal Body */}
        <div>{children}</div>
      </div>
    </div>
  );
};
