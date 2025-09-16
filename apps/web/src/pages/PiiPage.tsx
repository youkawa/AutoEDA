import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { piiScan } from '@autoeda/client-sdk';

export function PiiPage() {
  const { datasetId } = useParams();
  const [result, setResult] = useState<{ detected_fields: string[]; mask_policy: string } | null>(null);

  useEffect(() => { void piiScan(datasetId!, ['email', 'phone', 'price']).then(setResult); }, [datasetId]);

  return (
    <div>
      <h1>PII スキャン</h1>
      {result ? (
        <div>
          <div>検出: {result.detected_fields.join(', ') || 'なし'}</div>
          <div>ポリシー: {result.mask_policy}</div>
        </div>
      ) : 'スキャン中...'}
    </div>
  );
}

