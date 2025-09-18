import React from 'react';
import { AlertTriangle, Info, CheckCircle2, Octagon as OctagonAlert } from 'lucide-react';

type Tone = 'info' | 'warning' | 'success' | 'error';

const toneMap: Record<Tone, { container: string; icon: React.ComponentType<{ className?: string }> }> = {
  info: { container: 'border-slate-200 bg-slate-50 text-slate-700', icon: Info },
  warning: { container: 'border-amber-200 bg-amber-50 text-amber-700', icon: AlertTriangle },
  success: { container: 'border-emerald-200 bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  error: { container: 'border-red-200 bg-red-50 text-red-700', icon: OctagonAlert },
};

export function Callout({
  tone = 'info',
  title,
  children,
  className = '',
}: {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const { container, icon: Icon } = toneMap[tone];
  return (
    <div className={`rounded-3xl border p-6 ${container} ${className}`} role={tone === 'error' ? 'alert' : 'status'}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5" />
        <div className="space-y-1">
          {title ? <p className="font-semibold">{title}</p> : null}
          {children ? <div className="text-sm">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}
