import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { askQnA } from '@autoeda/client-sdk';
import type { Answer } from '@autoeda/schemas';

export function QnaPage() {
  const { datasetId } = useParams();
  const [q, setQ] = useState('売上のトレンドは？');
  const [ans, setAns] = useState<Answer[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function onAsk() {
    setLoading(true);
    const res = await askQnA(datasetId!, q);
    setAns(res);
    setLoading(false);
  }

  return (
    <div>
      <h1>Q&A</h1>
      <input value={q} onChange={e => setQ(e.target.value)} style={{ width: '60%' }} />
      <button onClick={onAsk} disabled={loading} style={{ marginLeft: 8 }}>質問する</button>
      {loading && <div>問い合わせ中...</div>}
      {ans && (
        <div>
          <h2>回答</h2>
          <p>{ans[0]?.text}</p>
          <div>引用被覆率: {Math.round((ans[0]?.coverage ?? 0) * 100)}%</div>
        </div>
      )}
    </div>
  );
}
