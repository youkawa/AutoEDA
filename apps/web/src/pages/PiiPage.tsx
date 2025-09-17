import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { piiScan, applyPiiPolicy } from '@autoeda/client-sdk';
import type { PIIScanResult } from '@autoeda/schemas';

export function PiiPage() {
  const { datasetId } = useParams();
  const [result, setResult] = useState<PIIScanResult | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [policy, setPolicy] = useState<'MASK' | 'HASH' | 'DROP'>('MASK');
  const [loading, setLoading] = useState(false);
  const defaults = useMemo(() => ['email', 'phone', 'ssn'], []);

  useEffect(() => {
    void (async () => {
      const res = await piiScan(datasetId!, defaults);
      setResult(res);
      setSelected(res.masked_fields.length ? res.masked_fields : res.detected_fields);
      setPolicy(res.mask_policy as 'MASK' | 'HASH' | 'DROP');
    })();
  }, [datasetId, defaults]);

  const onToggle = (field: string) => {
    setSelected(prev => (prev.includes(field) ? prev.filter(v => v !== field) : [...prev, field]));
  };

  const onApply = async () => {
    if (!datasetId) return;
    setLoading(true);
    try {
      const applied = await applyPiiPolicy(datasetId, policy, selected);
      const updated = await piiScan(datasetId, defaults);
      setResult({ ...updated, masked_fields: applied.masked_fields, mask_policy: applied.mask_policy, updated_at: applied.updated_at });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>PII スキャン</h1>
      {!result ? (
        'スキャン中...'
      ) : (
        <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
          <div>
            <div>検出フィールド</div>
            {result.detected_fields.length === 0 ? (
              <div>なし</div>
            ) : (
              <ul>
                {result.detected_fields.map(field => (
                  <li key={field}>
                    <label>
                      <input type="checkbox" checked={selected.includes(field)} onChange={() => onToggle(field)} /> {field}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label>
            マスクポリシー:
            <select value={policy} onChange={e => setPolicy(e.target.value as 'MASK' | 'HASH' | 'DROP')} style={{ marginLeft: 8 }}>
              <option value="MASK">MASK</option>
              <option value="HASH">HASH</option>
              <option value="DROP">DROP</option>
            </select>
          </label>
          <button onClick={onApply} disabled={loading}>
            {loading ? '適用中...' : 'マスクを適用して再計算'}
          </button>
          <div>適用済み: {result.masked_fields.join(', ') || 'なし'}</div>
          {result.updated_at && <div>最終更新: {new Date(result.updated_at).toLocaleString()}</div>}
        </div>
      )}
    </div>
  );
}
