import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getEDAReport } from '@autoeda/client-sdk';

export function EdaPage() {
  const { datasetId } = useParams();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<{
    issues: { description: string }[];
  } | null>(null);

  useEffect(() => {
    (async () => {
      const r = await getEDAReport(datasetId!);
      setReport(r);
      setLoading(false);
    })();
  }, [datasetId]);

  if (loading) return <div>読み込み中...</div>;
  if (!report) return <div>レポートが見つかりません</div>;
  return (
    <div>
      <h1>EDA 概要</h1>
      <div>
        <h2>品質課題</h2>
        <ul>
          {report.issues.map((i, idx: number) => (
            <li key={idx}>{i.description}</li>
          ))}
        </ul>
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
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
