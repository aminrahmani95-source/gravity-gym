import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-3xl border border-dashed border-[#272B30] bg-[#15181B]/70 p-8 sm:p-12 text-center ${className}`}
    >
      {icon && (
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1D2125] text-[#9CA3A8] border border-[#272B30]">
          {icon}
        </div>
      )}
      <h3 className="text-sm sm:text-base font-bold text-[#F4F5F2]">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-xs text-[#9CA3A8] leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
};
