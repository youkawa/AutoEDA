import React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
};

export function Button({ variant = 'primary', style, ...rest }: ButtonProps) {
  const base: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: 8,
    cursor: 'pointer',
    border: '1px solid transparent',
  };
  const variants: Record<string, React.CSSProperties> = {
    primary: { background: '#2563eb', color: 'white' },
    secondary: { background: '#e5e7eb', color: '#111827' },
    ghost: { background: 'transparent', color: '#2563eb', borderColor: '#bfdbfe' },
  };
  return <button {...rest} style={{ ...base, ...variants[variant], ...style }} />;
}

