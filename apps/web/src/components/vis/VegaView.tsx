import React, { useEffect, useRef, useState } from 'react';

type Props = { spec: unknown; renderer?: 'canvas' | 'svg'; className?: string };

export function VegaView({ spec, renderer = 'svg', className }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let view: { finalize?: () => void } | null = null;
    let cancelled = false;
    async function run() {
      try {
        type Embed = (el: HTMLElement, spec: unknown, opts: Record<string, unknown>) => Promise<{ view?: { finalize?: () => void } }>;
        const embed = (await import('vega-embed')).default as unknown as Embed;
        if (!ref.current || cancelled) return;
        const result = await embed(ref.current, spec, { renderer, actions: false, mode: 'vega-lite' });
        view = result?.view;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg || 'failed to render vega');
      }
    }
    run();
    return () => {
      cancelled = true;
      try {
        if (view && typeof view.finalize === 'function') view.finalize();
      } catch {
        /* noop */
      }
    };
  }, [spec, renderer]);

  if (error) return <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">{error}</div>;
  return <div ref={ref} className={className} />;
}
