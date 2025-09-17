import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getEDAReport } from '@autoeda/client-sdk';
import type { EDAReport } from '@autoeda/schemas';

export function EdaPage() {
  const { datasetId } = useParams();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<EDAReport | null>(null);
  const [showReferences, setShowReferences] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await getEDAReport(datasetId!);
      setReport(r);
      setLoading(false);
    })();
  }, [datasetId]);

  if (loading) return <div>読み込み中...</div>;
  const references = report?.references ?? [];
  if (!report) return <div>レポートが見つかりません</div>;
  const { summary, data_quality_report, key_features, next_actions, distributions } = report;
  const fallbackActive = references.some(ref => (ref.locator ?? '').startsWith('tool:'));

  return (
    <div>
      <h1>EDA 概要</h1>
      {fallbackActive && (
        <div style={{ padding: '8px 12px', background: '#fff5d6', border: '1px solid #f0c36d', borderRadius: 6, marginBottom: 16 }}>
          LLMフォールバック: ツール要約のみ表示中
        </div>
      )}
      <section>
        <h2>サマリー</h2>
        <ul>
          <li>行数: {summary.rows.toLocaleString()}</li>
          <li>列数: {summary.cols}</li>
          <li>欠損率: {(summary.missing_rate * 100).toFixed(1)}%</li>
        </ul>
      </section>
      <section>
        <h2>主要な分布</h2>
        <ul>
          {distributions.map(dist => (
            <li key={dist.column}>
              {dist.column} — 欠損 {Math.round((dist.missing / Math.max(dist.count, 1)) * 100)}%
            </li>
          ))}
          {distributions.length === 0 && <li>数値列の分布がありません。</li>}
        </ul>
      </section>
      <section>
        <h2>品質課題</h2>
        <ul>
          {data_quality_report.issues.map((issue, idx) => (
            <li key={`${issue.column}-${idx}`}>
              <strong>[{issue.severity}] {issue.column}</strong>: {issue.description}
            </li>
          ))}
          {data_quality_report.issues.length === 0 && <li>重大な品質課題は検出されていません。</li>}
        </ul>
      </section>
      <section>
        <h2>注目すべき特徴</h2>
        <ul>
          {key_features.map((feat, idx) => (
            <li key={idx}>{feat}</li>
          ))}
          {key_features.length === 0 && <li>重要な特徴がまだ見つかっていません。</li>}
        </ul>
      </section>
      <section>
        <h2>次アクション</h2>
        <ol>
          {next_actions.map(action => (
            <li key={action.title}>
              <strong>{action.title}</strong> — score {action.score.toFixed(2)} / impact {(action.impact * 100).toFixed(0)}%
              {action.reason && <div>理由: {action.reason}</div>}
            </li>
          ))}
          {next_actions.length === 0 && <li>次アクション候補はまだありません。</li>}
        </ol>
      </section>
      <section>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>ビュー切替</h2>
          <button onClick={() => setShowReferences(false)} disabled={!showReferences}>
            統計ビュー
          </button>
          <button onClick={() => setShowReferences(true)} disabled={showReferences}>
            引用ビュー
          </button>
        </div>
        {showReferences ? (
          <div>
            <h3>参照一覧</h3>
            <ul>
              {references.map((ref, idx) => (
                <li key={`${ref.locator}-${idx}`}>
                  {ref.kind}:{' '}
                  {ref.locator}
                  {ref.locator?.startsWith('tool:') && <span style={{ marginLeft: 6, color: '#b45309' }}>（ツール由来）</span>}
                </li>
              ))}
              {references.length === 0 && <li>参照はまだありません。</li>}
            </ul>
          </div>
        ) : (
          <div>
            <h3>統計サマリー</h3>
            <ul>
              <li>欠損率: {(summary.missing_rate * 100).toFixed(1)}%</li>
              <li>品質課題数: {data_quality_report.issues.length}</li>
              <li>提案アクション数: {next_actions.length}</li>
            </ul>
          </div>
        )}
      </section>
      <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link to={`/charts/${datasetId}`}>可視化を自動提案</Link>
        <Link to={`/qna/${datasetId}`}>Q&A</Link>
        <Link to={`/actions/${datasetId}`}>Next Actions</Link>
        <Link to={`/pii/${datasetId}`}>PII</Link>
        <Link to={`/leakage/${datasetId}`}>Leakage</Link>
        <Link to={`/recipes/${datasetId}`}>Recipes</Link>
      </div>
    </div>
  );
}
