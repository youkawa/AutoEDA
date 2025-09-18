import React from 'react';

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  className = '',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-card ${className}`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <Icon className="h-6 w-6" />
      </span>
      <div>
        <p className="text-xs uppercase tracking-widest text-slate-400">{sub}</p>
        <p className="text-lg font-semibold text-slate-900">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </div>
  );
}

