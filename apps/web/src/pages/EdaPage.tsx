import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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
    </div>
  );
}
