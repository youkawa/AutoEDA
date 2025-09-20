import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { listSavedCharts, deleteSavedChart, type SavedChart, generateChartWithProgress } from '@autoeda/client-sdk';
import { Button, useToast } from '@autoeda/ui-kit';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/Card';
import { VegaView } from '../components/vis/VegaView';

export function SavedChartsPage() {
  const { datasetId } = useParams();
  const [items, setItems] = useState<SavedChart[]>([]);
  const [q, setQ] = useState('');
  const [inflight, setInflight] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!datasetId) return;
    void listSavedCharts(datasetId).then(setItems).catch(() => setItems([]));
  }, [datasetId]);

  const filtered = useMemo(() => {
    if (!q) return items;
    const t = q.toLowerCase();
    return items.filter((it) => (
      (it.title || '').toLowerCase().includes(t) ||
      (it.hint || '').toLowerCase().includes(t) ||
      (it.chart_id || '').toLowerCase().includes(t) ||
      (it.id || '').toLowerCase().includes(t)
    ));
  }, [items, q]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">保存済みチャート</h1>
          <p className="text-sm text-slate-600">データセット {datasetId}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input
            className="h-9 w-64 rounded-lg border border-slate-300 px-3"
            placeholder="検索（タイトル/種類/ID）"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Link to={`/charts/${datasetId}`} className="text-brand-600 underline">
            提案へ戻る
          </Link>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.length === 0 ? (
          <Card padding="lg" className="md:col-span-2 xl:col-span-3">
            <CardHeader>
              <CardTitle>保存はありません</CardTitle>
              <CardDescription>チャート提案から「保存」を実行すると、ここに表示されます。</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          filtered.map((it) => (
            <Card key={it.id} padding="lg" className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="truncate" title={it.title || it.hint || it.chart_id || it.id}>{it.title || it.hint || it.chart_id || it.id}</span>
                  <span className="text-xs text-slate-500">{new Date(it.created_at).toLocaleString()}</span>
                </CardTitle>
                <CardDescription>hint: {it.hint ?? '-'} / id: {it.chart_id ?? it.id}</CardDescription>
              </CardHeader>
              <CardContent className="min-h-[160px]">
                {it.vega ? (
                  <VegaView spec={it.vega} className="rounded border" />
                ) : it.svg ? (
                  <div className="rounded border border-slate-200 bg-white p-2" dangerouslySetInnerHTML={{ __html: it.svg }} />
                ) : (
                  <div className="rounded border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">プレビューなし</div>
                )}
              </CardContent>
              <CardFooter className="mt-auto flex items-center justify-between text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={inflight === `rerun:${it.id}`}
                    onClick={async () => {
                      if (!datasetId) return;
                      setInflight(`rerun:${it.id}`);
                      try {
                        const res = await generateChartWithProgress(datasetId, (it.hint as any) || 'bar', [], () => {});
                        if (res?.outputs?.[0]?.mime === 'image/svg+xml') {
                          toast('再実行しました（提案へ表示されます）', 'success');
                        } else {
                          toast('再実行は完了しましたが可視化を生成できませんでした', 'info');
                        }
                      } catch {
                        toast('再実行に失敗しました', 'error');
                      } finally {
                        setInflight(null);
                      }
                    }}
                  >
                    再実行
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={inflight === `render:${it.id}`}
                    onClick={() => {
                      // Vega のみ再描画（SVGはそのまま）
                      toast(it.vega ? '再描画しました' : '再描画できる情報がありません', it.vega ? 'success' : 'info');
                    }}
                  >
                    再描画
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={inflight === `del:${it.id}`}
                    onClick={async () => {
                      try {
                        setInflight(`del:${it.id}`);
                        await deleteSavedChart(it.id);
                        setItems((arr) => arr.filter((x) => x.id !== it.id));
                        toast('削除しました', 'success');
                      } catch {
                        toast('削除に失敗しました', 'error');
                      } finally {
                        setInflight(null);
                      }
                    }}
                  >
                    削除
                  </Button>
                </div>
              </CardFooter>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

