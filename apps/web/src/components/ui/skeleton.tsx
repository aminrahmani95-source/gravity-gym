import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  rounded = '2xl',
  ...props
}) => {
  const roundedStyles = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    '3xl': 'rounded-3xl',
    full: 'rounded-full',
  };

  return (
    <div
      className={`animate-pulse bg-[#1D2125] border border-[#272B30]/40 ${roundedStyles[rounded]} ${className}`}
      {...props}
    />
  );
};

export const GymCardSkeleton: React.FC = () => {
  return (
    <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-24 rounded-xl" />
        <Skeleton className="h-6 w-16 rounded-xl" />
      </div>
      <Skeleton className="h-44 w-full rounded-2xl" />
      <Skeleton className="h-6 w-3/4 rounded-xl" />
      <Skeleton className="h-4 w-1/2 rounded-lg" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-16 rounded-lg" />
        <Skeleton className="h-6 w-16 rounded-lg" />
        <Skeleton className="h-6 w-16 rounded-lg" />
      </div>
      <div className="pt-4 border-t border-[#202428]">
        <Skeleton className="h-11 w-full rounded-2xl" />
      </div>
    </div>
  );
};
