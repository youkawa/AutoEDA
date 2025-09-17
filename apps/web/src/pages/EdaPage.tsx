import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getEDAReport } from '@autoeda/client-sdk';
import type { EDAReport } from '@autoeda/schemas';

export function EdaPage() {
  const { datasetId } = useParams();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<EDAReport | null>(null);

  useEffect(() => {
    (async () => {
      const r = await getEDAReport(datasetId!);
      setReport(r);
      setLoading(false);
    })();
  }, [datasetId]);

  if (loading) return <div>読み込み中...</div>;
  if (!report) return <div>レポートが見つかりません</div>;
  const { summary, data_quality_report, key_features, next_actions, distributions } = report;

  return (
    <div>
      <h1>EDA 概要</h1>
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
