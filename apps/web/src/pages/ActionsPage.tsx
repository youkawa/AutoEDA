import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getEDAReport, prioritizeActions } from '@autoeda/client-sdk';
import type { PrioritizedAction, PrioritizeItem, EDAReport } from '@autoeda/schemas';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/Card';
import { Button } from '@autoeda/ui-kit';
import { ClipboardCheck, BarChart3, ArrowRight } from 'lucide-react';
import { Callout } from '../components/ui/Callout';
import { Pill } from '../components/ui/Pill';
import { useLastDataset } from '../contexts/LastDatasetContext';

export function ActionsPage() {
  const { datasetId } = useParams();
  const { setLastDataset } = useLastDataset();
  const items: PrioritizeItem[] = useMemo(
    () => [
      { title: '欠損補完', reason: '高欠損列を補完し分析品質を向上', impact: 0.9, effort: 0.35, confidence: 0.8 },
      { title: '特徴量追加', reason: '季節性を反映する特徴量が不足', impact: 0.7, effort: 0.5, confidence: 0.7 },
    ],
    []
  );
  const [ranked, setRanked] = useState<PrioritizedAction[]>([]);
  const [report, setReport] = useState<EDAReport | null>(null);
  const [mode, setMode] = useState<'stats' | 'references'>('stats');

  useEffect(() => {
    if (!datasetId) return;
    void prioritizeActions(datasetId, items).then((res) => {
      setRanked(res);
    });
  }, [datasetId, items]);

  useEffect(() => {
    if (!datasetId) return;
    setLastDataset({ id: datasetId });
    let active = true;
    void getEDAReport(datasetId).then((result) => {
      if (active) setReport(result);
    });
    return () => {
      active = false;
    };
  }, [datasetId, setLastDataset]);

  const references = report?.references ?? [];
  const fallbackActive = references.some((ref) => (ref.locator ?? '').startsWith('tool:'));

  return (
    <div className="space-y-6">
      {fallbackActive ? (
        <Callout tone="warning" title="LLM フォールバック中">
          ツール結果を基に優先度を計算しています。
        </Callout>
      ) : null}

      <Card padding="lg" className="space-y-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-lg">
            <ClipboardCheck className="h-5 w-5 text-brand-600" />
            推奨アクション・優先度
          </CardTitle>
          <CardDescription>
            WSJF / RICE 指標を用いて優先度を算出しています。impact・effort・confidence をもとに調整可能です。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ranked.length === 0 ? (
            <p className="text-sm text-slate-500">次アクション候補がまだありません。</p>
          ) : (
            ranked.map((action) => {
              const score = action.score ?? action.wsjf ?? 0;
              const wsjf = action.wsjf ?? action.score ?? 0;
              const rice = action.rice ?? action.score ?? 0;
              return (
                <div
                  key={action.title}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm transition hover:shadow-card"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-slate-900">{action.title}</p>
                      {action.reason ? (
                        <p className="text-sm text-slate-600">{action.reason}</p>
                      ) : null}
                    </div>
                    <div className="flex gap-2 text-xs text-slate-500">
                      <span className="rounded-full bg-brand-50 px-3 py-1 text-brand-600">score {score.toFixed(2)}</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1">WSJF {wsjf.toFixed(2)}</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1">RICE {rice.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <p className="text-xs uppercase tracking-widest text-slate-400">Impact</p>
                      <div className="mt-1"><Pill tone="emerald">{`${Math.round(action.impact * 100)}%`}</Pill></div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <p className="text-xs uppercase tracking-widest text-slate-400">Effort</p>
                      <div className="mt-1"><Pill tone="amber">{`${Math.round(action.effort * 100)}%`}</Pill></div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <p className="text-xs uppercase tracking-widest text-slate-400">Confidence</p>
                      <div className="mt-1"><Pill tone="brand">{`${Math.round(action.confidence * 100)}%`}</Pill></div>
                    </div>
                  </div>
                  {action.dependencies?.length ? (
                    <p className="mt-3 text-xs text-slate-500">依存タスク: {action.dependencies.join(', ')}</p>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-3">
          <Button variant="primary" icon={<BarChart3 className="h-4 w-4" />}>
            プランをエクスポート
          </Button>
          <Button variant="secondary" icon={<ArrowRight className="h-4 w-4" />} onClick={() => setMode('references')}>
            引用を確認
          </Button>
        </CardFooter>
      </Card>

      <Card padding="lg">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-lg">ビュー切替</CardTitle>
            <CardDescription>統計情報または引用ソースを表示します。</CardDescription>
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
            <ul className="grid gap-4 text-sm text-slate-600 sm:grid-cols-3">
              <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                推奨アクション数: {ranked.length}
              </li>
              <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                入力候補数: {items.length}
              </li>
              <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                フォールバック: {fallbackActive ? '有効' : '無効'}
              </li>
            </ul>
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

// MetricPill は Pill を用いた置換によりDRY化しました
