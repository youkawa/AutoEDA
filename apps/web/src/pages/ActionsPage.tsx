import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { prioritizeActions } from '@autoeda/client-sdk';
import type { PrioritizedAction, PrioritizeItem } from '@autoeda/schemas';

export function ActionsPage() {
  const { datasetId } = useParams();
  const items: PrioritizeItem[] = useMemo(() => ([
    { title: '欠損補完', impact: 8, effort: 3, confidence: 0.8 },
    { title: '特徴量追加', impact: 6, effort: 2, confidence: 0.7 },
  ]), []);
  const [ranked, setRanked] = useState<PrioritizedAction[]>([]);

  useEffect(() => { void prioritizeActions(datasetId!, items).then(setRanked); }, [datasetId]);

  return (
    <div>
      <h1>Next Actions</h1>
      <ol>
        {ranked.map(a => (
          <li key={a.title}>{a.title} — score: {a.score}</li>
        ))}
      </ol>
    </div>
  );
}
