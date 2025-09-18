import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { suggestCharts } from '@autoeda/client-sdk';
import type { ChartCandidate } from '@autoeda/schemas';
import { Button } from '@autoeda/ui-kit';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/Card';
import { useLastDataset } from '../contexts/LastDatasetContext';
import { BarChart3, CheckCircle2, AlertTriangle, Info, Layers } from 'lucide-react';

export function ChartsPage() {
  const { datasetId } = useParams();
  const { lastDataset, setLastDataset } = useLastDataset();
  const [loading, setLoading] = useState(true);
  const [charts, setCharts] = useState<ChartCandidate[]>([]);
  const [showConsistentOnly, setShowConsistentOnly] = useState(true);

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
          <Button
            variant={showConsistentOnly ? 'primary' : 'secondary'}
            icon={<CheckCircle2 className="h-4 w-4" />}
            onClick={() => setShowConsistentOnly((prev) => !prev)}
          >
            一致率 95% 以上のみ表示
          </Button>
          <Button
            variant="secondary"
            icon={<Layers className="h-4 w-4" />}
            onClick={() => setShowConsistentOnly(false)}
          >
            すべて表示
          </Button>
        </div>
      </header>

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
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest ${
                        isHighConfidence
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {confidence}%
                    </span>
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
                  <Button
                    variant={isHighConfidence ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setShowConsistentOnly(false)}
                  >
                    詳細を検証
                  </Button>
                </CardFooter>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
