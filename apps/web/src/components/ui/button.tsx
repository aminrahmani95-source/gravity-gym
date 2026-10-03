import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'purple';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = '',
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-bold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0D0F11] disabled:opacity-50 disabled:cursor-not-allowed select-none cursor-pointer';

    const sizeStyles = {
      sm: 'text-xs px-3 py-1.5 rounded-xl gap-1.5',
      md: 'text-xs sm:text-sm px-4 py-2.5 rounded-xl gap-2 shadow-xs',
      lg: 'text-sm sm:text-base px-6 py-3 rounded-2xl gap-2.5 shadow-sm',
    };

    const variantStyles = {
      primary:
        'bg-[#C8F500] text-[#0D0F11] font-black shadow-md shadow-[#C8F500]/15 hover:bg-[#D6FB33] active:bg-[#B3DC00] active:scale-[0.98] focus-visible:ring-[#C8F500]',
      secondary:
        'bg-[#1D2125] text-[#F4F5F2] border border-[#272B30] hover:bg-[#22272C] hover:border-[#353B41] active:scale-[0.98] focus-visible:ring-[#C8F500]/40',
      purple:
        'bg-violet-600 text-white shadow-violet-600/20 hover:bg-violet-500 active:scale-[0.98] focus-visible:ring-violet-500',
      outline:
        'border border-[#353B41] bg-transparent text-[#F4F5F2] hover:bg-[#1D2125] hover:border-[#4B535B] active:scale-[0.98] focus-visible:ring-[#C8F500]/40',
      ghost:
        'bg-transparent text-[#C4C8CC] hover:bg-[#1D2125] hover:text-[#F4F5F2] focus-visible:ring-[#C8F500]/30',
      danger:
        'bg-red-600 text-white shadow-red-500/20 hover:bg-red-500 active:scale-[0.98] focus-visible:ring-red-500',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading ? 'true' : undefined}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}
        <span>{children}</span>
        {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
