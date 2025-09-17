import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { suggestCharts } from '@autoeda/client-sdk';
import type { ChartCandidate } from '@autoeda/schemas';

export function ChartsPage() {
  const { datasetId } = useParams();
  const [loading, setLoading] = useState(true);
  const [charts, setCharts] = useState<ChartCandidate[]>([]);

  useEffect(() => {
    (async () => {
      const res = await suggestCharts(datasetId!, 5);
      setCharts(res);
      setLoading(false);
    })();
  }, [datasetId]);

  if (loading) return <div>読み込み中...</div>;
  return (
    <div>
      <h1>Charts 候補</h1>
      <ul>
        {charts.map(c => (
          <li key={c.id}>
            <strong>{c.type}</strong>: {c.explanation} (consistency: {Math.round(c.consistency_score * 100)}%)
            <div>根拠: {c.source_ref?.locator ?? 'N/A'}</div>
            {c.diagnostics && (
              <div style={{ fontSize: 12, color: '#555' }}>
                {c.diagnostics.trend && <span>トレンド: {c.diagnostics.trend} </span>}
                {c.diagnostics.correlation !== undefined && <span>相関: {Number(c.diagnostics.correlation).toFixed(2)}</span>}
                {c.diagnostics.dominant_ratio !== undefined && <span>支配率: {Math.round(Number(c.diagnostics.dominant_ratio) * 100)}%</span>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
