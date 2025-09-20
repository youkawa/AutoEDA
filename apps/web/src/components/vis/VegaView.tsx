import React, { useEffect, useRef, useState } from 'react';

type Props = { spec: any; renderer?: 'canvas' | 'svg'; className?: string };

export function VegaView({ spec, renderer = 'svg', className }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let view: any;
    let cancelled = false;
    async function run() {
      try {
        const embed = (await import('vega-embed')).default;
        if (!ref.current || cancelled) return;
        const result = await embed(ref.current, spec, { renderer, actions: false, mode: 'vega-lite' });
        view = result?.view;
      } catch (e: any) {
        setError(e?.message || 'failed to render vega');
      }
    }
    run();
    return () => {
      cancelled = true;
      try { view && view.finalize && view.finalize(); } catch {}
    };
  }, [spec, renderer]);

  if (error) return <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">{error}</div>;
  return <div ref={ref} className={className} />;
}

