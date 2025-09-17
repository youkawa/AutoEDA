import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { leakageScan, resolveLeakage } from '@autoeda/client-sdk';
import type { LeakageScanResult } from '@autoeda/schemas';

export function LeakagePage() {
  const { datasetId } = useParams();
  const [res, setRes] = useState<LeakageScanResult | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const defaults = useMemo(() => datasetId, [datasetId]);

  useEffect(() => {
    if (!datasetId) return;
    void (async () => {
      const result = await leakageScan(datasetId);
      setRes(result);
      setSelected(result.flagged_columns);
    })();
  }, [datasetId, defaults]);

  const toggle = (column: string) => {
    setSelected(prev => (prev.includes(column) ? prev.filter(c => c !== column) : [...prev, column]));
  };

  const apply = async (action: 'exclude' | 'acknowledge' | 'reset') => {
    if (!datasetId || selected.length === 0) return;
    setLoading(true);
    try {
      const updated = await resolveLeakage(datasetId, action, selected);
      setRes(updated);
      setSelected(updated.flagged_columns);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>リーク検査</h1>
      {!res ? (
        '検査中...'
      ) : (
        <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
          <div>
            <div>検出されたリーク候補</div>
            {res.flagged_columns.length === 0 ? (
              <div>なし</div>
            ) : (
              <ul>
                {res.flagged_columns.map(col => (
                  <li key={col}>
                    <label>
                      <input type="checkbox" checked={selected.includes(col)} onChange={() => toggle(col)} /> {col}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => apply('exclude')} disabled={loading || selected.length === 0}>除外して再計算</button>
              <button onClick={() => apply('acknowledge')} disabled={loading || selected.length === 0}>承認して維持</button>
              <button onClick={() => apply('reset')} disabled={loading || selected.length === 0}>選択をリセット</button>
            </div>
          </div>
          <div>
            <strong>除外済み</strong>: {res.excluded_columns?.join(', ') || 'なし'}
          </div>
          <div>
            <strong>承認済み</strong>: {res.acknowledged_columns?.join(', ') || 'なし'}
          </div>
          <div>検出ルール: {res.rules_matched.join(', ') || 'なし'}</div>
          {res.updated_at && <div>最終更新: {new Date(res.updated_at).toLocaleString()}</div>}
        </div>
      )}
    </div>
  );
}
