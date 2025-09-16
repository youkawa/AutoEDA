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
          </li>
        ))}
      </ul>
    </div>
  );
}
