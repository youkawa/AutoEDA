import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { suggestCharts, generateChart, generateChartsBatch } from '@autoeda/client-sdk';
import type { ChartCandidate } from '@autoeda/schemas';
import { Button, useToast } from '@autoeda/ui-kit';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/Card';
import { useLastDataset } from '../contexts/LastDatasetContext';
import { BarChart3, CheckCircle2, AlertTriangle, Info, Layers } from 'lucide-react';
import { Pill } from '../components/ui/Pill';
import { Modal } from '../components/ui/Modal';

export function ChartsPage() {
  const { datasetId } = useParams();
  const { lastDataset, setLastDataset } = useLastDataset();
  const [loading, setLoading] = useState(true);
  const [charts, setCharts] = useState<ChartCandidate[]>([]);
  const [showConsistentOnly, setShowConsistentOnly] = useState(true);
  const [selectedDetail, setSelectedDetail] = useState<ChartCandidate | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  type ChartRender = { loading: boolean; error?: string; src?: string; code?: string; tab?: 'viz'|'code'|'meta' };
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
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <BarChart3 className="h-4 w-4" /> {charts.length} 件の候補が見つかりました。
          </p>
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
          <div className="text-sm text-slate-700">{selectedIds.size} 件選択中</div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={async () => {
                if (!datasetId) return;
                try {
                  const hints = charts.filter((c) => selectedIds.has(c.id)).map((c) => c.type);
                  const res = await generateChartsBatch(datasetId, hints);
                  // 簡易反映: 各カードに最初の出力(SVG)を描画
                  const next: Record<string, ChartRender> = { ...results };
                  charts.forEach((c, idx) => {
                    if (!selectedIds.has(c.id)) return;
                    const r = res[Math.min(idx, res.length - 1)];
                    const out = r?.outputs?.[0];
                    if (out && out.mime === 'image/svg+xml' && typeof out.content === 'string') {
                      next[c.id] = { loading: false, src: `data:image/svg+xml;utf8,${encodeURIComponent(out.content)}` };
                    }
                  });
                  setResults(next);
                } catch (err) {
                  const message = err instanceof Error ? err.message : '一括生成に失敗しました';
                  toast(message, 'error');
                }
              }}
            >
              一括生成
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())}>
              キャンセル
            </Button>
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
                    <Pill tone={isHighConfidence ? 'emerald' : 'amber'}>{confidence}%</Pill>
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
                    <Button
                      variant={isHighConfidence ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={async () => {
                        if (!datasetId) return;
                        setResults((s) => ({ ...s, [chart.id]: { loading: true, step: 'preparing', tab: 'viz' } }));
                        setTimeout(() => setResults((s) => ({ ...s, [chart.id]: { ...(s[chart.id] ?? {}), loading: true, step: 'generating', tab: 'viz' } })), 200);
                        setTimeout(() => setResults((s) => ({ ...s, [chart.id]: { ...(s[chart.id] ?? {}), loading: true, step: 'running', tab: 'viz' } })), 400);
                        try {
                          const r = await generateChart(datasetId, chart.type);
                          const out = r.outputs?.[0];
                          if (out && out.mime === 'image/svg+xml' && typeof out.content === 'string') {
                            const src = `data:image/svg+xml;utf8,${encodeURIComponent(out.content)}`;
                            setResults((s) => ({ ...s, [chart.id]: { loading: false, step: 'done', src, code: r.code, tab: 'viz' } }));
                          } else {
                            setResults((s) => ({ ...s, [chart.id]: { loading: false, step: 'done', error: '出力形式に未対応' } }));
                          }
                        } catch (err) {
                          const message = err instanceof Error ? err.message : '生成に失敗';
                          setResults((s) => ({ ...s, [chart.id]: { loading: false, step: 'done', error: message } }));
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
                  <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">{results[chart.id]?.error}</div>
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
                      <div className="ml-auto">
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
                      </div>
                    </div>
                    <div className="p-3 text-sm">
                      {results[chart.id]?.tab !== 'code' ? (
                        results[chart.id]?.src ? <img src={results[chart.id]!.src} alt="generated chart" /> : null
                      ) : (
                        <pre className="overflow-auto rounded bg-slate-50 p-3 text-xs text-slate-800">{results[chart.id]?.code ?? '# 生成されたコードはありません'}</pre>
                      )}
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
    </div>
  );
}
