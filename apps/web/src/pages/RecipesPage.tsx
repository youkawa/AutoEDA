import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { emitRecipes } from '@autoeda/client-sdk';
import type { RecipeEmitResult } from '@autoeda/schemas';

export function RecipesPage() {
  const { datasetId } = useParams();
  const [state, setState] = useState<RecipeEmitResult | null>(null);
  useEffect(() => { void emitRecipes(datasetId!).then(setState); }, [datasetId]);
  return (
    <div>
      <h1>Recipes</h1>
      {!state ? (
        <div>生成中...</div>
      ) : (
        <div>
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
        </div>
      )}
    </div>
  );
}
