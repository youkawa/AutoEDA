import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { leakageScan, resolveLeakage } from '@autoeda/client-sdk';
import type { LeakageScanResult } from '@autoeda/schemas';
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
import { AlertTriangle, ShieldCheck, RefreshCw } from 'lucide-react';
import { Pill } from '../components/ui/Pill';

type LeakageAction = 'exclude' | 'acknowledge' | 'reset';

export function LeakagePage() {
  const { datasetId } = useParams();
  const { setLastDataset } = useLastDataset();
  const [result, setResult] = useState<LeakageScanResult | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!datasetId) return;
    setLastDataset({ id: datasetId });
    void leakageScan(datasetId).then((res) => {
      setResult(res);
      setSelected(res.flagged_columns);
    });
  }, [datasetId, setLastDataset]);

  const toggle = (column: string) => {
    setSelected((prev) => (prev.includes(column) ? prev.filter((c) => c !== column) : [...prev, column]));
  };

  const apply = async (action: LeakageAction) => {
    if (!datasetId || selected.length === 0) return;
    setLoading(true);
    try {
      const updated = await resolveLeakage(datasetId, action, selected);
      setResult(updated);
      setSelected(updated.flagged_columns);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card padding="lg" className="space-y-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-lg">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            リーク検査
          </CardTitle>
          <CardDescription>未来情報やターゲットリークの可能性がある特徴量を検出します。</CardDescription>
        </CardHeader>

        {!result ? (
          <CardContent>
            <p className="text-sm text-slate-500">検査中...</p>
          </CardContent>
        ) : (
          <CardContent className="space-y-4">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">検出されたリーク候補</p>
              {result.flagged_columns.length === 0 ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  リークの疑いがある特徴量は検出されませんでした。
                </div>
              ) : (
                <div className="space-y-2">
                  {result.flagged_columns.map((column) => (
                    <label
                      key={column}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">{column}</p>
                        <p className="text-xs text-slate-500">{result.rules_matched.join(', ') || 'rules: N/A'}</p>
                      </div>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        checked={selected.includes(column)}
                        onChange={() => toggle(column)}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <p className="text-xs uppercase tracking-widest text-slate-400">除外済み</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(result.excluded_columns ?? []).length === 0 ? (
                    <span className="text-slate-500">なし</span>
                  ) : (
                    result.excluded_columns.map((v) => <Pill key={v} tone="brand">{v}</Pill>)
                  )}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <p className="text-xs uppercase tracking-widest text-slate-400">承認済み</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(result.acknowledged_columns ?? []).length === 0 ? (
                    <span className="text-slate-500">なし</span>
                  ) : (
                    result.acknowledged_columns.map((v) => <Pill key={v} tone="emerald">{v}</Pill>)
                  )}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <p className="text-xs uppercase tracking-widest text-slate-400">最終更新</p>
                <p>{result.updated_at ? new Date(result.updated_at).toLocaleString() : '未登録'}</p>
              </div>
            </div>
          </CardContent>
        )}

        <CardFooter className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            disabled={!result || selected.length === 0}
            loading={loading}
            icon={<ShieldCheck className="h-4 w-4" />}
            onClick={() => apply('exclude')}
          >
            除外して再計算
          </Button>
          <Button
            variant="secondary"
            disabled={!result || selected.length === 0}
            onClick={() => apply('acknowledge')}
          >
            承認して維持
          </Button>
          <Button
            variant="secondary"
            disabled={!result || selected.length === 0}
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => apply('reset')}
          >
            選択をリセット
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// StatusPill は Pill に置換しDRY化
