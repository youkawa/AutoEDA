import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getEDAReport, listDatasets } from '@autoeda/client-sdk';
import type { EDAReport } from '@autoeda/schemas';
import { Button } from '@autoeda/ui-kit';
import { Activity, BarChart3, ArrowRight, Table2, Percent, FileText, CheckCircle2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/Card';
import { useLastDataset } from '../contexts/LastDatasetContext';
import { Pill } from '../components/ui/Pill';
import { Callout } from '../components/ui/Callout';
import { StatCard } from '../components/ui/StatCard';

type ViewMode = 'stats' | 'references';

const severityTone: Record<string, 'red' | 'amber' | 'emerald'> = {
  critical: 'red',
  high: 'red',
  medium: 'amber',
  low: 'emerald',
};

export function EdaPage() {
  const { datasetId } = useParams();
  const navigate = useNavigate();
  const { lastDataset, setLastDataset } = useLastDataset();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<EDAReport | null>(null);
  const [mode, setMode] = useState<ViewMode>('stats');

  // StrictMode二重実行対策: ページ内で同一datasetIdのリクエストをデデュープ
  const inflightMapRef = useRef<Map<string, Promise<EDAReport>>>(new Map());
  useEffect(() => {
    let mounted = true;
    if (!datasetId) return;
    setLoading(true);
    const key = `eda:${datasetId}`;
    const inflight = inflightMapRef.current.get(key);
    const runner = inflight ?? getEDAReport(datasetId);
    if (!inflight) {
      inflightMapRef.current.set(key, runner);
    }
    void runner
      .then((response) => {
        if (!mounted) return;
        setReport(response);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setReport(null);
        setLoading(false);
      })
      .finally(() => {
        // 完了後はキャッシュを破棄（最新状態を常に取得する方針）
        inflightMapRef.current.delete(key);
      });
    return () => {
      mounted = false;
    };
  }, [datasetId]);

  useEffect(() => {
    if (!datasetId) return;
    if (!lastDataset || lastDataset.id !== datasetId) {
      setLastDataset({ id: datasetId });
    } else if (!lastDataset.name) {
      void listDatasets().then((items) => {
        const found = items.find((item) => item.id === datasetId);
        if (found) {
          setLastDataset({ id: found.id, name: found.name });
        }
      });
    }
  }, [datasetId, lastDataset, setLastDataset]);

  const references = report?.references ?? [];
  const fallbackActive = references.some((ref) => (ref.locator ?? '').startsWith('tool:'));

  const metrics = useMemo(() => {
    if (!report) return [];
    return [
      {
        label: '行数',
        value: report.summary.rows.toLocaleString(),
        icon: Table2,
        sub: 'Rows',
      },
      {
        label: '列数',
        value: report.summary.cols.toLocaleString(),
        icon: Activity,
        sub: 'Columns',
      },
      {
        label: '欠損率',
        value: `${(report.summary.missing_rate * 100).toFixed(1)}%`,
        icon: Percent,
        sub: 'Missing',
      },
    ];
  }, [report]);

  if (loading) {
    return (
      <div className="space-y-6" aria-label="loading">
        <div className="h-32 animate-pulse rounded-3xl bg-white shadow-sm" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl bg-white shadow-sm" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-3xl bg-white shadow-sm" />
      </div>
    );
  }

  if (!report || !datasetId) {
    return (
      <Card padding="lg" className="text-center">
        <CardHeader>
          <CardTitle>レポートが見つかりません</CardTitle>
          <CardDescription>データセットを再度読み込み、もう一度お試しください。</CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Button variant="primary" onClick={() => navigate('/datasets')}>
            データセット一覧へ戻る
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const { summary, data_quality_report, key_features, next_actions, distributions } = report;

  return (
    <div className="space-y-8">
      {fallbackActive ? (
        <Callout tone="warning" title="LLM フォールバックが適用されています">
          LLM 資格情報が未設定のため、ツールの要約のみを表示しています。`/settings` から API Key を設定すると、引用付きの要約が生成されます。
        </Callout>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {metrics.map(({ label, value, icon: Icon, sub }) => (
          <StatCard key={label} icon={Icon} label={label} value={value} sub={sub} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <Card padding="lg" className="space-y-4">
          <CardHeader className="mb-2">
            <CardTitle className="flex items-center gap-3 text-lg">
              <BarChart3 className="h-5 w-5 text-brand-600" />
              データ品質トリアージ
            </CardTitle>
            <CardDescription>
              重大度順にソートされた品質課題と推定統計。重大な問題ほど上位に表示されます。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data_quality_report.issues.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                品質課題は検出されませんでした。
              </div>
            ) : (
              data_quality_report.issues.map((issue, index) => (
                <div
                  key={`${issue.column}-${index}`}
                  className={`rounded-2xl border border-slate-200 bg-white px-4 py-3`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">{issue.column}</p>
                    <Pill tone={severityTone[issue.severity] ?? 'emerald'}>{issue.severity}</Pill>
                  </div>
                  <p className="text-sm text-slate-700">{issue.description}</p>
                  {issue.statistic ? (
                    <p className="mt-1 text-xs text-slate-600">
                      {Object.entries(issue.statistic)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(' / ')}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card padding="lg" className="space-y-4">
          <CardHeader className="mb-2">
            <CardTitle className="text-lg">コア指標</CardTitle>
            <CardDescription>注目すべき特徴量と、推奨されるアクションの概要です。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">注目トピック</p>
              {key_features.length === 0 ? (
                <p>重要な特徴がまだ見つかっていません。</p>
              ) : (
                <ul className="space-y-2">
                  {key_features.map((feature, index) => (
                    <li key={index} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-500" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">推奨アクション</p>
              {next_actions.length === 0 ? (
                <p>次アクション候補がまだありません。</p>
              ) : (
                <ul className="space-y-2">
                  {next_actions.slice(0, 3).map((action) => (
                    <li key={action.title} className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="font-medium text-slate-900">{action.title}</p>
                      <p className="text-xs text-slate-500">score {action.score.toFixed(2)} / impact {(action.impact * 100).toFixed(0)}%</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button
              variant="secondary"
              size="sm"
              icon={<ArrowRight className="h-4 w-4" />}
              onClick={() => navigate(`/actions/${datasetId}`)}
            >
              次アクションの詳細を見る
            </Button>
          </CardFooter>
        </Card>
      </div>

      <Card padding="lg" className="space-y-6">
        <CardHeader>
          <CardTitle className="text-lg">分布サマリー</CardTitle>
          <CardDescription>代表的な数値列について欠損率と分布の傾向を可視化します。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {distributions.length === 0 ? (
            <p className="text-sm text-slate-500">数値列の分布がありません。</p>
          ) : (
            distributions.map((dist) => {
              const total = dist.histogram.reduce((sum, value) => sum + value, 0);
              return (
                <div key={dist.column} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-800">{dist.column}</span>
                    <span className="text-xs text-slate-500">欠損 {(dist.missing / Math.max(dist.count, 1) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {dist.histogram.map((value, idx) => (
                      <div
                        key={`${dist.column}-${idx}`}
                        className="rounded-full bg-brand-200"
                        style={{ height: `${total ? Math.max(12, (value / total) * 60) : 12}px` }}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card padding="lg">
        <CardHeader className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-lg">ビュー切替</CardTitle>
            <CardDescription>統計の要約と引用ソースを切り替えて確認できます。</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant={mode === 'stats' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setMode('stats')}
            >
              統計サマリー
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
            <ul className="grid gap-3 text-sm text-slate-600 md:grid-cols-3">
              <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-400">欠損率</p>
                <p className="text-lg font-semibold text-slate-900">{(summary.missing_rate * 100).toFixed(1)}%</p>
              </li>
              <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-400">品質課題数</p>
                <p className="text-lg font-semibold text-slate-900">{data_quality_report.issues.length}</p>
              </li>
              <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-400">推奨アクション</p>
                <p className="text-lg font-semibold text-slate-900">{next_actions.length}</p>
              </li>
            </ul>
          ) : (
            <div className="space-y-3">
              {references.length === 0 ? (
                <p className="text-sm text-slate-500">参照はまだありません。</p>
              ) : (
                references.map((ref, index) => (
                  <div
                    key={`${ref.locator}-${index}`}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600"
                  >
                    <div>
                      <span className="font-medium text-slate-800">{ref.kind}</span>
                      <span className="ml-3 text-slate-500">{ref.locator}</span>
                    </div>
                    {ref.locator?.startsWith('tool:') ? (
                      <span className="text-xs font-semibold uppercase tracking-widest text-amber-600">ツール由来</span>
                    ) : (
                      <span className="text-xs text-emerald-600">LLM 検証済み</span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          icon={<BarChart3 className="h-4 w-4" />}
          onClick={() => navigate(`/charts/${datasetId}`)}
        >
          チャート提案を見る
        </Button>
        <Button
          variant="secondary"
          icon={<FileText className="h-4 w-4" />}
          onClick={() => navigate(`/qna/${datasetId}`)}
        >
          Q&A を実行
        </Button>
        <Button
          variant="secondary"
          icon={<CheckCircle2 className="h-4 w-4" />}
          onClick={() => navigate(`/actions/${datasetId}`)}
        >
          次アクションを確認
        </Button>
      </div>
    </div>
  );
}
