import React from 'react';

type Tone = 'red' | 'amber' | 'emerald' | 'brand' | 'slate';

export function Pill({ tone = 'slate', children, className = '' }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  const toneClass: Record<Tone, string> = {
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    brand: 'bg-brand-100 text-brand-700',
    slate: 'bg-slate-100 text-slate-700',
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest ${toneClass[tone]} ${className}`}>{children}</span>
  );
}

