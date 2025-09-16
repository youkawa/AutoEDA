import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { leakageScan } from '@autoeda/client-sdk';

export function LeakagePage() {
  const { datasetId } = useParams();
  const [res, setRes] = useState<{ flagged_columns: string[]; rules_matched: string[] } | null>(null);

  useEffect(() => { void leakageScan(datasetId!).then(setRes); }, [datasetId]);

  return (
    <div>
      <h1>リーク検査</h1>
      {res ? (
        <div>
          <div>flagged: {res.flagged_columns.join(', ') || 'なし'}</div>
          <div>rules: {res.rules_matched.join(', ') || 'なし'}</div>
        </div>
      ) : '検査中...'}
    </div>
  );
}

