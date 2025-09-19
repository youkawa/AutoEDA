import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@autoeda/ui-kit';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Upload, Workflow, ShieldCheck, Sparkles, ArrowRight, LineChart, ClipboardList } from 'lucide-react';
import { useLastDataset } from '../contexts/LastDatasetContext';

export function HomePage() {
  const navigate = useNavigate();
  const { lastDataset } = useLastDataset();
  const [slo, setSlo] = useState<{ events?: Record<string, { count?: number; p95?: number; groundedness_min?: number }> }>({});

  useEffect(() => {
    fetch(`${(import.meta as any).env?.VITE_API_BASE ?? ''}/api/metrics/slo`).then(async (r) => {
      if (!r.ok) return;
      try { setSlo(await r.json()); } catch {}
    }).catch(() => {});
  }, []);

  const featureHighlights = useMemo(
    () => [
      {
        icon: Upload,
        title: '即時プロファイリング',
        description: '最大 100 万行の CSV をアップロードし、欠損・型崩れ・外れ値を自動で可視化します。',
      },
      {
        icon: LineChart,
        title: 'チャートと根拠付き Q&A',
        description: 'RAG による引用付きレポートで、意思決定に必要な根拠を一枚で提示します。',
      },
      {
        icon: ShieldCheck,
        title: '品質・セキュリティガード',
        description: 'PII やリークリスクを自動検査し、推奨対処を提示します。',
      },
      {
        icon: Workflow,
        title: '再現レシピと次アクション',
        description: 'WSJF/RICE スコアで優先度を可視化し、ノートブックと SQL をすぐに共有できます。',
      },
    ],
    []
  );

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-500 to-purple-500 text-white shadow-xl">
        <div className="grid gap-8 px-6 py-10 md:grid-cols-[2fr,1fr] md:px-12 md:py-14">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1 text-xs font-semibold uppercase tracking-widest">
              <Sparkles className="h-4 w-4" />
              AutoEDA Orchestrated EDA Platform
            </div>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              データ探索を、<br className="hidden md:block" />
              設計〜再現までワンストップで
            </h1>
            <p className="max-w-xl text-sm text-white/80 md:text-base">
              アップロードからチャート提案、根拠付き Q&A、次アクション、PII/リーク検査、レシピ出力まで。
              AutoEDA は、分析に必要な定型作業を自動化し、チームが仮説検証に集中できる環境を提供します。
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                size="lg"
                onClick={() => navigate('/datasets')}
                icon={<ArrowRight className="h-4 w-4" />}
              >
                データセットを選択
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="bg-white text-brand-600 hover:bg-brand-50"
                onClick={() => navigate('/settings')}
                icon={<ShieldCheck className="h-4 w-4" />}
              >
                LLM 設定を確認
              </Button>
            </div>
            {lastDataset ? (
              <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/15 p-4 text-sm text-white/90 shadow-inner">
                <ClipboardList className="h-5 w-5" />
                <div>
                  <p className="font-semibold">最近のデータセット</p>
                  <p className="text-xs text-white/70">{lastDataset.name ?? lastDataset.id}</p>
                </div>
                <Button
                  variant="ghost"
                  className="ml-auto text-white underline decoration-dotted underline-offset-4"
                  onClick={() => navigate(`/eda/${lastDataset.id}`)}
                >
                  続きを見る
                </Button>
              </div>
            ) : null}
          </div>

          <div className="hidden rounded-2xl border border-white/25 bg-white/10 p-6 backdrop-blur-lg lg:flex lg:flex-col lg:justify-between">
            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-widest text-white/70">ワークフローフロー</p>
              <ol className="space-y-4 text-sm">
                {[
                  'CSV / 外部ソースを取り込み、即時プロファイルを生成',
                  'チャートと説明文の整合性チェック、Q&A で根拠確認',
                  'PII/リーク検査を実施し、WSJF/RICE によるアクション優先度を提示',
                  '再現レシピ (Notebook / SQL) をエクスポートし、チームで共有',
                ].map((item, index) => (
                  <li key={item} className="flex gap-3">
                    <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-xs font-semibold">
                      {index + 1}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-xl bg-white/20 p-4 text-xs text-white/80">
              <p className="font-semibold text-white">SLO モニタリング</p>
              {slo?.events ? (
                <ul className="mt-2 grid grid-cols-2 gap-2">
                  {Object.entries(slo.events).slice(0,4).map(([name, v]) => (
                    <li key={name} className="rounded bg-white/10 p-2">
                      <div className="text-[11px] uppercase tracking-widest text-white/70">{name}</div>
                      <div className="mt-1 flex items-center gap-3">
                        <span>p95: {v.p95 ?? 0}ms</span>
                        <span>minG: {(v.groundedness_min ?? 1).toFixed(2)}</span>
                        <span>n={v.count ?? 0}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 leading-relaxed">`python apps/api/scripts/check_slo.py` で自動検証できます。</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {featureHighlights.map(({ icon: Icon, title, description }) => (
          <Card key={title} padding="lg">
            <CardHeader className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Icon className="h-5 w-5" />
              </span>
              <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
