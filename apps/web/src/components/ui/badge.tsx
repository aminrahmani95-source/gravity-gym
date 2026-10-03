import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | 'default'
    | 'secondary'
    | 'success'
    | 'warning'
    | 'danger'
    | 'outline'
    | 'tier-basic'
    | 'tier-plus'
    | 'tier-premium'
    | 'tier-elite';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  className = '',
  variant = 'default',
  size = 'md',
  children,
  ...props
}) => {
  const sizeStyles = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
  };

  const variantStyles = {
    default: 'bg-[#C8F500]/15 text-[#C8F500] border-[#C8F500]/30',
    secondary: 'bg-[#1D2125] text-[#C4C8CC] border-[#272B30]',
    success: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60',
    warning: 'bg-amber-950/60 text-amber-400 border-amber-800/60',
    danger: 'bg-red-950/60 text-red-400 border-red-800/60',
    outline: 'bg-transparent text-[#C4C8CC] border-[#353B41]',
    'tier-basic': 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60',
    'tier-plus': 'bg-cyan-950/60 text-cyan-400 border-cyan-800/60',
    'tier-premium': 'bg-violet-950/60 text-violet-400 border-violet-800/60',
    'tier-elite': 'bg-amber-950/60 text-amber-400 border-amber-800/60',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 font-bold rounded-xl border select-none ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
