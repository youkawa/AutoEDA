import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { prioritizeActions } from '@autoeda/client-sdk';
import type { PrioritizedAction, PrioritizeItem } from '@autoeda/schemas';

export function ActionsPage() {
  const { datasetId } = useParams();
  const items: PrioritizeItem[] = useMemo(() => ([
    { title: '欠損補完', reason: '欠損率高', impact: 0.9, effort: 0.35, confidence: 0.8 },
    { title: '特徴量追加', reason: '新しいセグメントを検証', impact: 0.7, effort: 0.5, confidence: 0.7 },
  ]), []);
  const [ranked, setRanked] = useState<PrioritizedAction[]>([]);

  useEffect(() => { void prioritizeActions(datasetId!, items).then(setRanked); }, [datasetId]);

  return (
    <div>
      <h1>Next Actions</h1>
      <ol>
        {ranked.map(a => {
          const wsjf = a.wsjf ?? a.score ?? 0;
          const rice = a.rice ?? a.score ?? 0;
          const score = a.score ?? wsjf;
          return (
            <li key={a.title}>
              <strong>{a.title}</strong>
              {' '}— WSJF {wsjf.toFixed(2)} / RICE {rice.toFixed(2)}
              {' '} (score {score.toFixed(2)}, impact {(a.impact * 100).toFixed(0)}%, effort {(a.effort * 100).toFixed(0)}%)
              {a.reason && <div>理由: {a.reason}</div>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
