import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { emitRecipes, getEDAReport } from '@autoeda/client-sdk';
import type { EDAReport, RecipeEmitResult } from '@autoeda/schemas';

export function RecipesPage() {
  const { datasetId } = useParams();
  const [state, setState] = useState<RecipeEmitResult | null>(null);
  const [report, setReport] = useState<EDAReport | null>(null);
  const [showReferences, setShowReferences] = useState(false);

  useEffect(() => {
    if (!datasetId) return;
    void emitRecipes(datasetId).then(setState);
  }, [datasetId]);

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
  const toleranceBreached = useMemo(() => {
    if (!state?.summary || !state?.measured_summary) return false;

    const compare = (base?: number, measured?: number) => {
      if (base === undefined || measured === undefined) return false;
      const denominator = Math.abs(base) > 1e-6 ? Math.abs(base) : 1;
      return Math.abs(measured - base) / denominator > 0.01;
    };

    const summary = state.summary;
    const measured = state.measured_summary;

    return (
      compare(summary.rows, measured.rows) ||
      compare(summary.cols, measured.cols) ||
      compare(summary.missing_rate, measured.missing_rate)
    );
  }, [state]);
  return (
    <div>
      <h1>Recipes</h1>
      {!state ? (
        <div>生成中...</div>
      ) : (
        <div>
          {fallbackActive && (
            <div style={{ padding: '8px 12px', background: '#fff5d6', border: '1px solid #f0c36d', borderRadius: 6, marginBottom: 16 }}>
              LLMフォールバック: ツール要約のみ表示中
            </div>
          )}
          {toleranceBreached && (
            <div style={{ padding: '8px 12px', background: '#fde2e1', border: '1px solid #f87171', borderRadius: 6, marginBottom: 16 }}>
              再現統計が許容値(±1%)を超えて乖離しています。サンプリング条件を確認してください。
            </div>
          )}
          <div>artifact_hash: {state.artifact_hash}</div>
          {state.summary && (
            <div>
              <div>行数: {state.summary.rows}</div>
              <div>列数: {state.summary.cols}</div>
              <div>欠損率: {(state.summary.missing_rate * 100).toFixed(2)}%</div>
            </div>
          )}
          <ul>
            {state.files.map(file => (
              <li key={file.path}>
                {file.name} — {Math.max(1, Math.round(file.size_bytes / 1024))} KB
              </li>
            ))}
          </ul>
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
                <h3>再現統計</h3>
                <ul>
                  {state.measured_summary ? (
                    <>
                      <li>rows: {state.measured_summary.rows}</li>
                      <li>cols: {state.measured_summary.cols}</li>
                      <li>missing_rate: {(Number(state.measured_summary.missing_rate ?? 0) * 100).toFixed(2)}%</li>
                    </>
                  ) : (
                    <li>再計測データはまだありません。</li>
                  )}
                </ul>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
