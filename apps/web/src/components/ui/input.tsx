import React, { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className = '',
      label,
      error,
      helperText,
      leadingIcon,
      trailingIcon,
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold text-[#C4C8CC] mb-1.5">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leadingIcon && (
            <div className="pointer-events-none absolute right-3.5 flex items-center text-[#9CA3A8]">
              {leadingIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            disabled={disabled}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={
              error && inputId
                ? `${inputId}-error`
                : helperText && inputId
                ? `${inputId}-helper`
                : undefined
            }
            className={`w-full rounded-2xl border bg-[#15181B] py-2.5 text-sm text-[#F4F5F2] shadow-sm transition-all placeholder:text-[#62686D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F500]/20 disabled:cursor-not-allowed disabled:bg-[#1D2125] disabled:text-[#62686D] ${
              leadingIcon ? 'pr-10' : 'pr-3.5'
            } ${trailingIcon ? 'pl-10' : 'pl-3.5'} ${
              error
                ? 'border-red-500/80 focus-visible:border-red-500 focus-visible:ring-red-500/20'
                : 'border-[#272B30] focus-visible:border-[#C8F500]'
            } ${className}`}
            {...props}
          />
          {trailingIcon && (
            <div className="pointer-events-none absolute left-3.5 flex items-center text-[#9CA3A8]">
              {trailingIcon}
            </div>
          )}
        </div>
        {error ? (
          <p id={inputId ? `${inputId}-error` : undefined} role="alert" className="mt-1.5 text-xs font-medium text-red-400">
            {error}
          </p>
        ) : helperText ? (
          <p id={inputId ? `${inputId}-helper` : undefined} className="mt-1 text-[11px] text-[#9CA3A8]">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
