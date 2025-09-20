import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { suggestCharts, generateChartWithProgress, generateChartsBatch, beginChartsBatchWithIds, getChartsBatchStatusWithMap, type ChartsBatchStatus } from '@autoeda/client-sdk';
import type { ChartCandidate } from '@autoeda/schemas';
import { Button, useToast } from '@autoeda/ui-kit';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/Card';
import { useLastDataset } from '../contexts/LastDatasetContext';
import { BarChart3, CheckCircle2, AlertTriangle, Info, Layers } from 'lucide-react';
import { Pill } from '../components/ui/Pill';
import { Modal } from '../components/ui/Modal';

export function ChartsPage() {
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const query = new URLSearchParams(search);
  const showLegend = query.get('legend') !== '0';
  const showThreshold = query.get('th') !== '0';
  const { datasetId } = useParams();
  const { lastDataset, setLastDataset } = useLastDataset();
  const [loading, setLoading] = useState(true);
  const [charts, setCharts] = useState<ChartCandidate[]>([]);
  const [showConsistentOnly, setShowConsistentOnly] = useState(true);
  const [selectedDetail, setSelectedDetail] = useState<ChartCandidate | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchInFlight, setBatchInFlight] = useState(false);
  type BatchProgress = { total: number; done: number; failed: number; running?: number; queued?: number; cancelled?: number; served?: number; avg_wait_ms?: number };
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [lastBatchStats, setLastBatchStats] = useState<BatchProgress | null>(null);
  const [batchItems, setBatchItems] = useState<{ chart_id?: string; status: string; stage?: 'generating'|'rendering'|'done' }[]>([]);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [announce, setAnnounce] = useState<string | null>(null);
  type Spark = { t?: string; served_pct: number; avg_wait_ms?: number; served?: number; total?: number };
  const [spark, setSpark] = useState<Spark[]>([]);
  type Step = 'preparing' | 'generating' | 'running' | 'rendering' | 'done';
  type ChartMeta = { dataset_id?: string; hint?: string };
  type ChartRender = { loading: boolean; step?: Step; error?: string; errorCode?: string; errorDetail?: string; showDetail?: boolean; src?: string; prevSrc?: string; code?: string; tab?: 'viz'|'code'|'meta'; meta?: ChartMeta };
  const [results, setResults] = useState<Record<string, ChartRender>>({});
  const toast = useToast();

  useEffect(() => {
    let mounted = true;
    if (!datasetId) return;
    setLoading(true);
    void suggestCharts(datasetId, 8).then((res) => {
      if (mounted) {
        setCharts(res);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [datasetId]);

  useEffect(() => {
    if (!datasetId) return;
    if (!lastDataset || lastDataset.id !== datasetId) {
      setLastDataset({ id: datasetId });
    }
  }, [datasetId, lastDataset, setLastDataset]);

  const filteredCharts = useMemo(() => {
    if (!showConsistentOnly) return charts;
    return charts.filter((chart) => chart.consistency_score >= 0.95);
  }, [charts, showConsistentOnly]);

  // fetch sparkline data for header
  useEffect(() => {
    if (!datasetId) return;
    const base = ((import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE) ?? '';
    fetch(`${base}/api/metrics/charts/snapshots?dataset_id=${encodeURIComponent(datasetId)}&limit=24`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((obj: unknown) => {
        const rec = obj as { series?: Spark[] } | undefined;
        const series = Array.isArray(rec?.series) ? rec!.series! : [];
        setSpark(series.map((e) => ({
          t: e.t,
          served_pct: Math.max(0, Math.min(100, Number(e.served_pct ?? 0))),
          avg_wait_ms: e.avg_wait_ms,
          served: e.served,
          total: e.total,
        })));
      })
      .catch(() => setSpark([]));
  }, [datasetId]);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[...Array(6)].map((_, index) => (
          <div key={index} className="h-48 animate-pulse rounded-3xl bg-white shadow-sm" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">チャート提案</h1>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span className="inline-flex items-center gap-2"><BarChart3 className="h-4 w-4" />{charts.length} 件の候補が見つかりました。</span>
            {spark.length > 0 ? (
              <span className="inline-flex items-center gap-2" title="直近の served 比率（%）。served% = served/total * 100">
                {showLegend ? (
                  <span className="inline-flex items-center gap-2 text-xs text-slate-400">
                    <span>served%</span>
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[9px] text-slate-500"
                      title="served% = served/total × 100"
                    >?
                    </span>
                    <span className="rounded border border-dashed border-emerald-400/60 bg-emerald-50 px-1.5 text-emerald-700" title="しきい値=80%">80%</span>
                  </span>
                ) : null}
                <span className="relative flex h-5 items-end gap-0.5">
                  {/* しきい値ライン 80% */}
                  {showThreshold ? (
                    <span className="absolute left-0 right-0 border-t border-dashed border-emerald-400/60" style={{ top: `${Math.max(0, 16 - Math.round(16 * 0.8))}px` }} title="しきい値 80%" />
                  ) : null}
                  {spark.map((e, i) => (
                    <span
                      key={`sp-${i}`}
                      className={`w-1.5 rounded-sm ${e.served_pct < 80 ? 'bg-rose-300/80' : 'bg-brand-500/70'}`}
                      title={`${e.t ?? ''} served: ${e.served ?? '-'} / total: ${e.total ?? '-'} (avg_wait: ${e.avg_wait_ms ?? '-'}ms)`}
                      style={{ height: `${Math.max(2, Math.round((e.served_pct/100)*16))}px`, outline: e.served_pct < 80 ? '1px solid rgba(244, 63, 94, 0.7)' : undefined }}
                    />
                  ))}
                </span>
                {(() => {
                  const vals = spark.map((e) => e.served_pct);
                  const min = Math.min(...vals);
                  const max = Math.max(...vals);
                  const p95 = (() => {
                    const a = [...vals].sort((a,b)=>a-b); if (a.length===0) return 0;
                    const pos = (a.length - 1) * 0.95; const li = Math.floor(pos); const ui = Math.min(li+1, a.length-1);
                    const frac = pos - li; return Math.round(a[li] + (a[ui]-a[li]) * frac);
                  })();
                  return showLegend ? <span className="text-[10px] text-slate-400" title={`p95 ${p95}%`}>min {min}% / max {max}% ・ しきい値=80%</span> : null;
                })()}
                {(() => {
                  const last = spark[spark.length-1]?.served_pct ?? 0;
                  const good = last >= 80;
                  return showLegend ? <span className={`rounded px-1.5 py-0.5 text-[11px] ${good?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`} title={`served% 現在値 ${last}%`}>{last}%</span> : null;
                })()}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant={showConsistentOnly ? 'primary' : 'secondary'} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setShowConsistentOnly((prev) => !prev)}>一致率 95% 以上のみ表示</Button>
          <Button
            variant="secondary"
            icon={<Layers className="h-4 w-4" />}
            onClick={() => setShowConsistentOnly(false)}
          >
            すべて表示
          </Button>
        </div>
      </header>

      {selectedIds.size > 0 ? (
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-700">
            {batchInFlight && batchProgress ? (
              <span>
                一括生成中… {batchProgress.done}/{batchProgress.total}
                {batchProgress.failed > 0 ? `（失敗 ${batchProgress.failed}）` : ''}
                {typeof batchProgress.running === 'number' ? `（実行中 ${batchProgress.running}）` : ''}
                {typeof batchProgress.queued === 'number' ? `（キュー ${batchProgress.queued}）` : ''}
                {typeof batchProgress.cancelled === 'number' && batchProgress.cancelled > 0 ? `（中断 ${batchProgress.cancelled}）` : ''}
                {typeof batchProgress.avg_wait_ms === 'number' ? `（平均待機 ${batchProgress.avg_wait_ms}ms）` : ''}
              </span>
            ) : (
              <span>{selectedIds.size} 件選択中</span>
            )}
            {/* live region for screen readers */}
            {batchInFlight && batchProgress ? (
              <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                バッチ進捗 完了 {batchProgress.done} / 全 {batchProgress.total}、実行中 {batchProgress.running ?? 0}、キュー {batchProgress.queued ?? 0}、失敗 {batchProgress.failed ?? 0}、中断 {batchProgress.cancelled ?? 0}{typeof batchProgress.avg_wait_ms === 'number' ? `、平均待機 ${batchProgress.avg_wait_ms} ミリ秒` : ''}
              </div>
            ) : null}
          </div>
          <div className="flex gap-2">
            {batchInFlight && batchProgress ? (
              <div className="hidden md:block w-64 self-center">
                <div className="h-2 w-full rounded bg-slate-100" role="progressbar" aria-valuenow={batchProgress.done} aria-valuemin={0} aria-valuemax={Math.max(1, batchProgress.total)} aria-label={`一括進捗 ${batchProgress.done}/${batchProgress.total}`}>
                  <div
                    className="h-2 rounded bg-brand-500 transition-all"
                    style={{ width: `${Math.round((batchProgress.done / Math.max(1, batchProgress.total)) * 100)}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-slate-500" title="用語: R=実行中, Q=キュー, F=失敗, C=中断, S=progress済み（served）。served% = served/total * 100。avg_wait はキュー待機の平均(ms)">
                  R:{batchProgress.running ?? 0} Q:{batchProgress.queued ?? 0} F:{batchProgress.failed ?? 0} C:{batchProgress.cancelled ?? 0} S:{batchProgress.served ?? 0}
                </div>
              </div>
            ) : null}
            <Button
              variant="primary"
              size="sm"
              disabled={batchInFlight}
              onClick={async () => {
                if (!datasetId) return;
                const pairs = charts.filter((c) => selectedIds.has(c.id)).map((c) => ({ chartId: c.id, hint: c.type }));
                if (pairs.length === 0) return;
                setBatchInFlight(true);
                setBatchProgress({ total: pairs.length, done: 0, failed: 0 });
                try {
                  const batchId = await beginChartsBatchWithIds(datasetId, pairs);
                  setCurrentBatchId(batchId || null);
                  if (!batchId) {
                    // 同期モードの可能性: 従来の関数で取得
                    const res = await generateChartsBatch(datasetId, pairs.map(p => p.hint));
                    const next: Record<string, ChartRender> = { ...results };
                    for (let i = 0; i < pairs.length; i++) {
                      const r = res[i];
                      const out = r?.outputs?.[0];
                      if (out && out.mime === 'image/svg+xml' && typeof out.content === 'string') {
                        next[pairs[i].chartId] = { loading: false, step: 'done', tab: 'viz', src: `data:image/svg+xml;utf8,${encodeURIComponent(out.content)}` };
                      }
                    }
                    setResults(next);
                    setBatchItems(pairs.map(() => ({ status: 'succeeded' })));
                  } else {
                    // ポーリングして進捗反映
                    let finished = false;
                    while (!finished) {
                      await new Promise((r) => setTimeout(r, 300));
                      const st: ChartsBatchStatus = await getChartsBatchStatusWithMap(batchId);
                      setBatchProgress({ total: st.total, done: st.done, failed: st.failed, running: st.running, queued: st.queued, cancelled: st.cancelled, served: st.served, avg_wait_ms: st.avg_wait_ms });
                      setBatchItems(st.items ?? []);
                      // propagate failures/cancellations into per-card results UI (friendly error)
                      if (Array.isArray(st.items)) {
                        setResults((prev) => {
                          const next = { ...prev } as Record<string, ChartRender>;
                          for (const it of st.items) {
                            if (!it.chart_id) continue;
                            if (it.status === 'failed' || it.status === 'cancelled') {
                              const friendly = it.error || (it.status === 'cancelled' ? '実行がキャンセルされました。' : '実行に失敗しました');
                              next[it.chart_id] = { ...(next[it.chart_id] ?? {}), loading: false, step: 'done', error: friendly, errorCode: it.error_code, errorDetail: it.error_detail };
                            }
                          }
                          return next;
                        });
                      }
                      if (st.results_map && Object.keys(st.results_map).length > 0) {
                        const next: Record<string, ChartRender> = { ...results };
                        for (const cid of Object.keys(st.results_map)) {
                          const r = st.results_map[cid]!;
                          const out = r?.outputs?.[0];
                          if (out && out.mime === 'image/svg+xml' && typeof out.content === 'string') {
                            next[cid] = { loading: false, step: 'done', tab: 'viz', src: `data:image/svg+xml;utf8,${encodeURIComponent(out.content)}` };
                          }
                        }
                        setResults(next);
                        finished = true;
                        setLastBatchStats({ total: st.total, done: st.done, failed: st.failed, running: st.running, queued: st.queued, cancelled: st.cancelled, served: st.served, avg_wait_ms: st.avg_wait_ms });
                        setAnnounce(`バッチが完了しました。完了 ${st.done} / 全 ${st.total}、失敗 ${st.failed ?? 0}、中断 ${st.cancelled ?? 0}`);
                      } else if (Array.isArray(st.results)) {
                        const next: Record<string, ChartRender> = { ...results };
                        for (let i = 0; i < pairs.length; i++) {
                          const r = st.results![i];
                          const out = r?.outputs?.[0];
                          if (out && out.mime === 'image/svg+xml' && typeof out.content === 'string') {
                            next[pairs[i].chartId] = { loading: false, step: 'done', tab: 'viz', src: `data:image/svg+xml;utf8,${encodeURIComponent(out.content)}` };
                          }
                        }
                        setResults(next);
                        finished = true;
                        setLastBatchStats({ total: st.total, done: st.done, failed: st.failed, running: st.running, queued: st.queued, cancelled: st.cancelled, served: st.served, avg_wait_ms: st.avg_wait_ms });
                        setAnnounce(`バッチが完了しました。完了 ${st.done} / 全 ${st.total}、失敗 ${st.failed ?? 0}、中断 ${st.cancelled ?? 0}`);
                      }
                    }
                  }
                } catch (err) {
                  const message = err instanceof Error ? err.message : '一括生成に失敗しました';
                  toast(message, 'error');
                } finally {
                  setBatchInFlight(false);
                  setCurrentBatchId(null);
                }
              }}
            >
              一括生成
            </Button>
            {batchInFlight && currentBatchId ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    const jobIds = batchItems.filter((it) => it.status === 'queued' || it.status === 'running').map((it) => it.chart_id).filter(Boolean) as string[];
                    if (jobIds.length === 0) return;
                    await fetch(`${(import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ?? ''}/api/charts/batches/${currentBatchId}/cancel`, {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ job_ids: jobIds }),
                    });
                    toast('キュー/実行中のジョブにキャンセルを指示しました', 'success');
                  } catch {
                    toast('キャンセルに失敗しました', 'error');
                  }
                }}
              >
                キャンセル（キュー/実行中）
              </Button>
            ) : null}
            {!batchInFlight && batchItems.some((it) => it.status === 'failed') ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  if (!datasetId) return;
                  const failedIds = batchItems.filter((it) => it.status === 'failed' && it.chart_id).map((it) => it.chart_id!)
                    .filter((id) => selectedIds.has(id));
                  if (failedIds.length === 0) return;
                  setBatchInFlight(true);
                  setBatchProgress({ total: failedIds.length, done: 0, failed: 0 });
                  try {
                    const pairs = charts.filter((c) => failedIds.includes(c.id)).map((c) => ({ chartId: c.id, hint: c.type }));
                    const batchId = await beginChartsBatchWithIds(datasetId, pairs);
                    let finished = false;
                    while (!finished) {
                      await new Promise((r) => setTimeout(r, 300));
                      const st: ChartsBatchStatus = await getChartsBatchStatusWithMap(batchId);
                      setBatchProgress({ total: st.total, done: st.done, failed: st.failed });
                      if (st.results_map && Object.keys(st.results_map).length > 0) {
                        const next: Record<string, ChartRender> = { ...results };
                        for (const cid of Object.keys(st.results_map)) {
                          const r = st.results_map[cid]!;
                          const out = r?.outputs?.[0];
                          if (out && out.mime === 'image/svg+xml' && typeof out.content === 'string') {
                            next[cid] = { loading: false, step: 'done', tab: 'viz', src: `data:image/svg+xml;utf8,${encodeURIComponent(out.content)}` };
                          }
                        }
                        setResults(next);
                        finished = true;
                      }
                    }
                  } catch (err) {
                    const message = err instanceof Error ? err.message : '再試行に失敗しました';
                    toast(message, 'error');
                  } finally {
                    setBatchInFlight(false);
                  }
                }}
              >
                失敗のみ再試行
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())}>
              キャンセル
            </Button>
          </div>
        </div>
      ) : null}

      {/* 恒常表示のミニ統計（直近のバッチ結果） */}
      {lastBatchStats ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600" title="直近バッチの served 比率と平均待機時間">
          <div className="flex items-center gap-3">
            <span className="font-semibold">直近バッチ統計</span>
            <span>served: {Math.max(0, Math.min(100, Math.round(((lastBatchStats.served ?? 0) / Math.max(1, lastBatchStats.total)) * 100)))}%</span>
            {typeof lastBatchStats.avg_wait_ms === 'number' ? <span>avg_wait: {lastBatchStats.avg_wait_ms}ms</span> : null}
          </div>
          <div className="mt-2 h-1.5 w-full rounded bg-slate-100">
            <div className="h-1.5 rounded bg-brand-500" style={{ width: `${Math.max(0, Math.min(100, Math.round(((lastBatchStats.served ?? 0) / Math.max(1, lastBatchStats.total)) * 100)))}%` }} />
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredCharts.length === 0 ? (
          <Card padding="lg" className="md:col-span-2 xl:col-span-3">
            <CardHeader>
              <CardTitle>該当するチャートがありません</CardTitle>
              <CardDescription>
                フィルタ条件を緩和するか、データ品質課題を解決した後に再度チャート提案を実行してください。
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          filteredCharts.map((chart) => {
            const confidence = Math.round(chart.consistency_score * 100);
            const isHighConfidence = confidence >= 95;
            return (
              <Card key={chart.id} padding="lg" className="flex flex-col">
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg capitalize">{chart.type}</CardTitle>
                      <CardDescription>{chart.explanation}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {batchItems.find((it) => it.chart_id === chart.id)?.status === 'cancelled' ? (
                        <Pill tone="amber">キャンセル</Pill>
                      ) : null}
                      <Pill tone={isHighConfidence ? 'emerald' : 'amber'}>{confidence}%</Pill>
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    根拠: {chart.source_ref?.locator ?? 'N/A'}
                  </div>
                </CardHeader>
                {chart.diagnostics ? (
                  <CardContent className="text-sm text-slate-600">
                    <div className="grid gap-2">
                      {chart.diagnostics.trend ? (
                        <div className="flex items-center gap-2">
                          <Info className="h-4 w-4 text-brand-500" />
                          <span>トレンド: {chart.diagnostics.trend}</span>
                        </div>
                      ) : null}
                      {chart.diagnostics.correlation !== undefined ? (
                        <div className="flex items-center gap-2">
                          <Info className="h-4 w-4 text-brand-500" />
                          <span>
                            相関: {Number(chart.diagnostics.correlation).toFixed(2)}
                          </span>
                        </div>
                      ) : null}
                      {chart.diagnostics.dominant_ratio !== undefined ? (
                        <div className="flex items-center gap-2">
                          <Info className="h-4 w-4 text-brand-500" />
                          <span>
                            支配率: {Math.round(Number(chart.diagnostics.dominant_ratio) * 100)}%
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </CardContent>
                ) : null}
                <CardFooter className="mt-auto flex items-center justify-between text-sm text-slate-500">
                  {isHighConfidence ? (
                    <span className="flex items-center gap-2 text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> 整合性チェック済み
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 text-amber-600">
                      <AlertTriangle className="h-4 w-4" /> 再確認を推奨
                    </span>
                  )}
                    <div className="flex items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(chart.id)}
                        onChange={(e) => {
                          const next = new Set(selectedIds);
                          if (e.target.checked) next.add(chart.id); else next.delete(chart.id);
                          setSelectedIds(next);
                        }}
                      />
                      <span className="text-xs text-slate-600">選択</span>
                    </label>
                    {(() => {
                      const it = batchItems.find((b) => b.chart_id === chart.id);
                      const stage = it?.stage;
                      if (!stage) return null;
                      const map: Record<string, string> = { generating: '生成中', rendering: '描画中', done: '完了' };
                      const tone = stage === 'done' ? 'emerald' : 'amber';
                      return <Pill tone={tone}>{map[stage] ?? stage}</Pill>;
                    })()}
                    <Button
                      variant={isHighConfidence ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={async () => {
                        if (!datasetId) return;
                        setResults((s) => ({ ...s, [chart.id]: { loading: true, step: 'preparing', tab: 'viz' } }));
                        try {
                          const r = await generateChartWithProgress(datasetId, chart.type, [], ({ stage }) => {
                            if (!stage) return;
                            const stepMap: Record<string, Step> = { generating: 'generating', rendering: 'rendering', done: 'done' };
                            const step = stepMap[stage] ?? 'generating';
                            setResults((s) => ({ ...s, [chart.id]: { ...(s[chart.id] ?? {}), loading: step !== 'done', step, tab: 'viz' } }));
                          });
                          const out = r.outputs?.[0];
                          if (out && out.mime === 'image/svg+xml' && typeof out.content === 'string') {
                            const src = `data:image/svg+xml;utf8,${encodeURIComponent(out.content)}`;
                            const meta = (r as unknown as { meta?: ChartMeta }).meta;
                            setResults((s) => ({ ...s, [chart.id]: { ...(s[chart.id] ?? {}), loading: false, step: 'done', src, code: r.code, tab: 'viz', meta } }));
                          } else {
                            setResults((s) => ({ ...s, [chart.id]: { loading: false, step: 'done', error: '出力形式に未対応' } }));
                          }
                        } catch (err) {
                          const anyErr = err as { message?: string; code?: string } | undefined;
                          const code = anyErr && anyErr.code ? String(anyErr.code) : undefined;
                          const friendlyMap: Record<string, string> = {
                            timeout: '実行がタイムアウトしました（制限時間超過）。',
                            cancelled: '実行がキャンセルされました。',
                            forbidden_import: '安全ポリシーにより禁止されたモジュール/関数が検出されました。',
                            format_error: '出力形式が不正です（JSONの解析に失敗）。',
                            unknown: '不明なエラーが発生しました。',
                          };
                          const message = err instanceof Error ? (err.message || '生成に失敗') : '生成に失敗';
                          const shown = code && friendlyMap[code] ? friendlyMap[code] : message;
                          setResults((s) => ({ ...s, [chart.id]: { loading: false, step: 'done', error: shown, errorCode: code } }));
                        }
                      }}
                    >
                      チャート作成
                    </Button>
                  </div>
                </CardFooter>
                {results[chart.id]?.loading ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
                    <div className="flex items-center gap-2"><span className={results[chart.id]?.step==='preparing'?'font-semibold':''}>準備</span>→<span className={results[chart.id]?.step==='generating'?'font-semibold':''}>コード生成</span>→<span className={results[chart.id]?.step==='running'?'font-semibold':''}>実行</span>→<span className={results[chart.id]?.step==='rendering'?'font-semibold':''}>レンダリング</span></div>
                  </div>
                ) : null}
                {results[chart.id]?.error ? (
                  <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
                    <div className="flex items-center gap-2">
                      <span>{results[chart.id]?.error}</span>
                      {results[chart.id]?.errorCode ? (
                        <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[11px] text-amber-900" title="エラーコード">{results[chart.id]?.errorCode}</span>
                      ) : null}
                      {results[chart.id]?.errorDetail ? (
                        <button
                          className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900 underline"
                          onClick={() => setResults((s) => ({ ...s, [chart.id]: { ...(s[chart.id] ?? {}), showDetail: !s[chart.id]?.showDetail } }))}
                        >詳細</button>
                      ) : null}
                    </div>
                    {results[chart.id]?.showDetail && results[chart.id]?.errorDetail ? (
                      <div className="mt-2">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-[11px] text-amber-900/80">詳細ログ（redact済み）</span>
                          <Button
                            variant="secondary"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(String(results[chart.id]?.errorDetail ?? ''));
                                toast('エラー詳細をコピーしました', 'success');
                              } catch {
                                toast('コピーに失敗しました', 'error');
                              }
                            }}
                          >コピー</Button>
                        </div>
                        <pre className="max-h-40 overflow-auto rounded bg-amber-100 p-2 text-[11px] text-amber-900" data-testid={`error-detail-${chart.id}`}>{results[chart.id]!.errorDetail}</pre>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {results[chart.id] && !results[chart.id]?.loading && !results[chart.id]?.error ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white">
                    <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 text-xs">
                      {['viz','code','meta'].map((k) => (
                        <button
                          key={k}
                          className={`rounded px-2 py-1 ${results[chart.id]?.tab === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                          onClick={() => setResults((s) => ({ ...s, [chart.id]: { ...s[chart.id]!, tab: k as 'viz'|'code'|'meta' } }))}
                        >
                          {k === 'viz' ? '可視化' : k === 'code' ? 'コード' : 'メタ'}
                        </button>
                      ))}
                      <div className="ml-auto flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={async () => {
                            try {
                              const code = results[chart.id]?.code ?? '';
                              if (!code) return;
                              await navigator.clipboard.writeText(String(code));
                              toast('コードをコピーしました', 'success');
                            } catch {
                              toast('コードのコピーに失敗しました', 'error');
                            }
                          }}
                        >
                          コードをコピー
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const r = results[chart.id];
                            if (!r?.src) return;
                            const a = document.createElement('a');
                            a.href = r.src;
                            a.download = `${chart.id}.svg`;
                            a.click();
                          }}
                        >
                          ダウンロード
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={async () => {
                            if (!datasetId) return;
                            // keep one history
                            setResults((s) => ({ ...s, [chart.id]: { ...(s[chart.id] ?? {}), prevSrc: s[chart.id]?.src } }));
                            setResults((s) => ({ ...s, [chart.id]: { ...(s[chart.id] ?? {}), loading: true, step: 'preparing', tab: 'viz' } }));
                            try {
                              const r = await generateChartWithProgress(datasetId, chart.type, [], ({ stage }) => {
                                if (!stage) return;
                                const stepMap: Record<string, Step> = { generating: 'generating', rendering: 'rendering', done: 'done' };
                                const step = stepMap[stage] ?? 'generating';
                                setResults((s) => ({ ...s, [chart.id]: { ...(s[chart.id] ?? {}), loading: step !== 'done', step, tab: 'viz' } }));
                              });
                              const out = r.outputs?.[0];
                              if (out && out.mime === 'image/svg+xml' && typeof out.content === 'string') {
                                const src = `data:image/svg+xml;utf8,${encodeURIComponent(out.content)}`;
                                const meta = (r as unknown as { meta?: ChartMeta }).meta;
                                setResults((s) => ({ ...s, [chart.id]: { ...(s[chart.id] ?? {}), loading: false, step: 'done', src, tab: 'viz', meta } }));
                              } else {
                                setResults((s) => ({ ...s, [chart.id]: { ...(s[chart.id] ?? {}), loading: false, step: 'done', error: '出力形式に未対応' } }));
                              }
                            } catch (err) {
                              const message = err instanceof Error ? err.message : '再実行に失敗';
                              setResults((s) => ({ ...s, [chart.id]: { ...(s[chart.id] ?? {}), loading: false, step: 'done', error: message } }));
                            }
                          }}
                        >
                          再実行
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const r = results[chart.id];
                            const blob = new Blob([r?.code ?? '{}'], { type: 'application/json;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${chart.id}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                        >
                          Vega JSON
                        </Button>
                      </div>
                    </div>
                    <div className="p-3 text-sm">
                      {results[chart.id]?.tab === 'viz' && results[chart.id]?.src ? (
                        <img src={results[chart.id]!.src} alt="generated chart" />
                      ) : null}
                      {results[chart.id]?.tab === 'viz' && !results[chart.id]?.src && results[chart.id]?.prevSrc ? (
                        <div className="rounded border border-slate-200 p-2 text-xs text-slate-600">前回結果を表示中
                          <img src={results[chart.id]!.prevSrc!} alt="previous chart" />
                        </div>
                      ) : null}
                      {results[chart.id]?.tab === 'code' ? (
                        <pre className="overflow-auto rounded bg-slate-50 p-3 text-xs text-slate-800">{results[chart.id]?.code ?? '# 生成されたコードはありません'}</pre>
                      ) : null}
                      {results[chart.id]?.tab === 'meta' ? (
                        <div className="grid gap-1 text-xs text-slate-600">
                          <div>dataset_id: {results[chart.id]?.meta?.dataset_id ?? '-'}</div>
                          <div>hint: {results[chart.id]?.meta?.hint ?? '-'}</div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })
        )}
      </div>

      <Modal open={Boolean(selectedDetail)} onClose={() => setSelectedDetail(null)} title="チャートの詳細検証">
        {selectedDetail ? (
          <div className="grid gap-4 text-sm text-slate-700">
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400">タイプ</p>
              <p className="font-medium capitalize">{selectedDetail.type}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400">説明</p>
              <p>{selectedDetail.explanation}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400">根拠</p>
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-slate-100 px-2 py-1">{selectedDetail.source_ref?.locator ?? 'N/A'}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(selectedDetail.source_ref?.locator ?? '');
                      toast('引用をコピーしました', 'success');
                    } catch {
                      toast('クリップボードへのコピーに失敗しました', 'error');
                    }
                  }}
                >
                  引用をコピー
                </Button>
              </div>
            </div>
            {selectedDetail.diagnostics ? (
              <div className="grid gap-2">
                <p className="text-xs uppercase tracking-widest text-slate-400">診断情報</p>
                {selectedDetail.diagnostics.trend && <p>トレンド: {selectedDetail.diagnostics.trend}</p>}
                {selectedDetail.diagnostics.correlation !== undefined && (
                  <p>相関: {Number(selectedDetail.diagnostics.correlation).toFixed(2)}</p>
                )}
                {selectedDetail.diagnostics.dominant_ratio !== undefined && (
                  <p>支配率: {Math.round(Number(selectedDetail.diagnostics.dominant_ratio) * 100)}%</p>
                )}
              </div>
            ) : null}

            <div className="mt-2 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setSelectedDetail(null)}>
                閉じる
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
      {/* screen reader announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announce ?? ''}</div>
    </div>
  );
}
