import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { emitRecipes } from '@autoeda/client-sdk';

export function RecipesPage() {
  const { datasetId } = useParams();
  const [state, setState] = useState<{ artifact_hash: string; files: string[] } | null>(null);
  useEffect(() => { void emitRecipes(datasetId!).then(setState); }, [datasetId]);
  return (
    <div>
      <h1>Recipes</h1>
      {!state ? (
        <div>生成中...</div>
      ) : (
        <div>
          <div>artifact_hash: {state.artifact_hash}</div>
          <ul>
            {state.files.map(f => (<li key={f}>{f}</li>))}
          </ul>
        </div>
      )}
    </div>
  );
}
