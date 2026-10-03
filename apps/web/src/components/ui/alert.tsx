import React from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  onDismiss?: () => void;
}

export const Alert: React.FC<AlertProps> = ({
  className = '',
  variant = 'info',
  title,
  onDismiss,
  children,
  ...props
}) => {
  const variantStyles = {
    info: 'border-sky-800/80 bg-sky-950/60 text-sky-200',
    success: 'border-emerald-800/80 bg-emerald-950/60 text-emerald-200',
    warning: 'border-amber-800/80 bg-amber-950/60 text-amber-200',
    error: 'border-red-800/80 bg-red-950/60 text-red-200',
  };

  const icons = {
    info: <Info className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />,
    success: <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />,
    error: <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />,
  };

  return (
    <div
      role="alert"
      className={`relative flex items-start gap-2.5 rounded-2xl border p-3.5 text-xs font-medium ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {icons[variant]}
      <div className="flex-1">
        {title && <h5 className="font-bold mb-0.5">{title}</h5>}
        <div className="leading-relaxed">{children}</div>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="rounded-lg p-1 text-[#9CA3A8] hover:bg-white/10 hover:text-[#F4F5F2] transition"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};
