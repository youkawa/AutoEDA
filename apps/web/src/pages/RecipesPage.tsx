import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { emitRecipes, getEDAReport } from '@autoeda/client-sdk';
import type { EDAReport, RecipeEmitResult } from '@autoeda/schemas';
import { Button } from '@autoeda/ui-kit';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/Card';
import { useLastDataset } from '../contexts/LastDatasetContext';
import { FileText, AlertTriangle, Download } from 'lucide-react';

export function RecipesPage() {
  const { datasetId } = useParams();
  const { setLastDataset } = useLastDataset();
  const [state, setState] = useState<RecipeEmitResult | null>(null);
  const [report, setReport] = useState<EDAReport | null>(null);
  const [mode, setMode] = useState<'stats' | 'references'>('stats');

  useEffect(() => {
    if (!datasetId) return;
    setLastDataset({ id: datasetId });
    void emitRecipes(datasetId).then(setState);
  }, [datasetId, setLastDataset]);

  useEffect(() => {
    if (!datasetId) return;
    void getEDAReport(datasetId).then(setReport);
  }, [datasetId]);

  const references = report?.references ?? [];
  const fallbackActive = references.some((ref) => (ref.locator ?? '').startsWith('tool:'));
  const toleranceBreached = useMemo(() => {
    if (!state?.summary || !state?.measured_summary) return false;
    const compare = (base?: number, measured?: number) => {
      if (base === undefined || measured === undefined) return false;
      const denominator = Math.abs(base) > 1e-6 ? Math.abs(base) : 1;
      return Math.abs(measured - base) / denominator > 0.01;
    };
    const { summary, measured_summary: measured } = state;
    return (
      compare(summary.rows, measured.rows) ||
      compare(summary.cols, measured.cols) ||
      compare(summary.missing_rate, measured.missing_rate)
    );
  }, [state]);

  return (
    <div className="space-y-6">
      {fallbackActive ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-700">
          LLM フォールバック: ツール要約のみでレシピを生成しています。
        </div>
      ) : null}
      {toleranceBreached ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700">
          再現統計が許容値(±1%)を超えています。サンプリング条件やポリシーを確認してください。
        </div>
      ) : null}

      <Card padding="lg" className="space-y-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-lg">
            <FileText className="h-5 w-5 text-brand-600" />
            再現レシピと成果物
          </CardTitle>
          <CardDescription>Notebook / SQL / JSON レシピを生成し、統計の再現性を検証します。</CardDescription>
        </CardHeader>
        {!state ? (
          <CardContent>
            <p className="text-sm text-slate-500">生成中...</p>
          </CardContent>
        ) : (
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <p className="text-xs uppercase tracking-widest text-slate-400">artifact_hash</p>
                <p className="font-mono text-xs text-slate-500">{state.artifact_hash}</p>
              </div>
              {state.summary ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p className="text-xs uppercase tracking-widest text-slate-400">元データ</p>
                  <p>行数: {state.summary.rows}</p>
                  <p>列数: {state.summary.cols}</p>
                  <p>欠損率: {(state.summary.missing_rate * 100).toFixed(2)}%</p>
                </div>
              ) : null}
              {state.measured_summary ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p className="text-xs uppercase tracking-widest text-slate-400">再計測</p>
                  <p>行数: {state.measured_summary.rows}</p>
                  <p>列数: {state.measured_summary.cols}</p>
                  <p>欠損率: {(Number(state.measured_summary.missing_rate ?? 0) * 100).toFixed(2)}%</p>
                </div>
              ) : null}
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">生成ファイル</p>
              <ul className="space-y-2">
                {state.files.map((file) => (
                  <li
                    key={file.path}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600"
                  >
                    <span>{file.name}</span>
                    <span>{Math.max(1, Math.round(file.size_bytes / 1024))} KB</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        )}
        <CardFooter className="flex gap-3">
          <Button variant="primary" icon={<Download className="h-4 w-4" />}>成果物をダウンロード</Button>
          <Button
            variant="secondary"
            icon={<AlertTriangle className="h-4 w-4" />}
            onClick={() => setMode('references')}
          >
            引用を確認
          </Button>
        </CardFooter>
      </Card>

      <Card padding="lg">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-lg">ビュー切替</CardTitle>
            <CardDescription>統計差分または引用元を確認します。</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant={mode === 'stats' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setMode('stats')}
            >
              統計ビュー
            </Button>
            <Button
              variant={mode === 'references' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setMode('references')}
            >
              引用ビュー
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {mode === 'stats' ? (
            state?.measured_summary ? (
              <ul className="grid gap-4 text-sm text-slate-600 sm:grid-cols-3">
                <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  行数差分: {state.measured_summary.rows - (state.summary?.rows ?? 0)}
                </li>
                <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  列数差分: {state.measured_summary.cols - (state.summary?.cols ?? 0)}
                </li>
                <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  欠損率差分: {state.summary ? ((state.measured_summary.missing_rate - state.summary.missing_rate) * 100).toFixed(2) : '--'}%
                </li>
              </ul>
            ) : (
              <p className="text-sm text-slate-500">再計測データはまだありません。</p>
            )
          ) : (
            <div className="space-y-2 text-sm text-slate-600">
              {references.length === 0 ? (
                <p>参照はまだありません。</p>
              ) : (
                references.map((ref, index) => (
                  <div
                    key={`${ref.locator}-${index}`}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  >
                    <span className="font-medium text-slate-800">{ref.kind}: {ref.locator}</span>
                    {ref.locator?.startsWith('tool:') ? (
                      <span className="text-xs font-semibold text-amber-600">ツール由来</span>
                    ) : (
                      <span className="text-xs font-semibold text-emerald-600">検証済み</span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
