import React, { useEffect, useState } from 'react';
import { listDatasets, type Dataset } from '@autoeda/client-sdk';
import { useNavigate } from 'react-router-dom';
import { Button } from '@autoeda/ui-kit';

export function DatasetsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const navigate = useNavigate();

  useEffect(() => { void listDatasets().then(setDatasets); }, []);

  return (
    <div>
      <h1>Datasets</h1>
      <ul>
        {datasets.map(ds => (
          <li key={ds.id} style={{ marginBottom: 8 }}>
            <Button onClick={() => navigate(`/eda/${ds.id}`)} variant="ghost">
              {ds.name}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
