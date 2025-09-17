import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getEDAReport, prioritizeActions } from '@autoeda/client-sdk';
import type { PrioritizedAction, PrioritizeItem, EDAReport } from '@autoeda/schemas';

export function ActionsPage() {
  const { datasetId } = useParams();
  const items: PrioritizeItem[] = useMemo(() => ([
    { title: '欠損補完', reason: '欠損率高', impact: 0.9, effort: 0.35, confidence: 0.8 },
    { title: '特徴量追加', reason: '新しいセグメントを検証', impact: 0.7, effort: 0.5, confidence: 0.7 },
  ]), []);
  const [ranked, setRanked] = useState<PrioritizedAction[]>([]);
  const [report, setReport] = useState<EDAReport | null>(null);
  const [showReferences, setShowReferences] = useState(false);

  useEffect(() => {
    if (!datasetId) return;
    void prioritizeActions(datasetId, items).then(setRanked);
  }, [datasetId, items]);

  useEffect(() => {
    if (!datasetId) return;
    let active = true;
    (async () => {
      const result = await getEDAReport(datasetId);
      if (active) setReport(result);
    })();
    return () => { active = false; };
  }, [datasetId]);

  const references = report?.references ?? [];
  const fallbackActive = references.some(ref => (ref.locator ?? '').startsWith('tool:'));

  return (
    <div>
      <h1>Next Actions</h1>
      {fallbackActive && (
        <div style={{ padding: '8px 12px', background: '#fff5d6', border: '1px solid #f0c36d', borderRadius: 6, marginBottom: 16 }}>
          LLMフォールバック: ツール要約のみ表示中
        </div>
      )}
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
      <section style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>ビュー切替</h2>
          <button onClick={() => setShowReferences(false)} disabled={!showReferences}>統計ビュー</button>
          <button onClick={() => setShowReferences(true)} disabled={showReferences}>引用ビュー</button>
        </div>
        {showReferences ? (
          <div>
            <h3>参照一覧</h3>
            <ul>
              {references.map((ref, idx) => (
                <li key={`${ref.locator}-${idx}`}>
                  {ref.kind}: {ref.locator}
                  {ref.locator?.startsWith('tool:') && <span style={{ marginLeft: 6, color: '#b45309' }}>（ツール由来）</span>}
                </li>
              ))}
              {references.length === 0 && <li>参照はまだありません。</li>}
            </ul>
          </div>
        ) : (
          <div>
            <h3>統計概況</h3>
            <ul>
              <li>推定アクション数: {ranked.length}</li>
              <li>入力候補数: {items.length}</li>
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
