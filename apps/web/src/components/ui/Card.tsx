import React from 'react';
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingMap = {
  none: 'p-0',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

export function Card({ className = '', padding = 'md', children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-card',
        paddingMap[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className = '', children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mb-4 flex flex-col gap-1', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({ className = '', children, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-lg font-semibold text-slate-900', className)} {...rest}>
      {children}
    </h3>
  );
}

export function CardDescription({ className = '', children, ...rest }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm text-slate-500', className)} {...rest}>
      {children}
    </p>
  );
}

export function CardContent({ className = '', children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('grid gap-4', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className = '', children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mt-6 flex items-center justify-between', className)} {...rest}>
      {children}
    </div>
  );
}
