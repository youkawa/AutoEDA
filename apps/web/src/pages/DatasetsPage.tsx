import React, { useEffect, useMemo, useState } from 'react';
import { listDatasets, type Dataset } from '@autoeda/client-sdk';
import { useNavigate } from 'react-router-dom';
import { Button } from '@autoeda/ui-kit';
import { Upload, FolderOpen, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { useLastDataset } from '../contexts/LastDatasetContext';

function formatUpdatedAt(value?: string) {
  if (!value) return '未取得';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function DatasetsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { setLastDataset } = useLastDataset();

  useEffect(() => {
    let mounted = true;
    void listDatasets().then((data) => {
      if (mounted) {
        setDatasets(data);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const summary = useMemo(() => {
    const totalRows = datasets.reduce((sum, item) => sum + (item.rows ?? 0), 0);
    const totalCols = datasets.reduce((sum, item) => sum + (item.cols ?? 0), 0);
    return {
      count: datasets.length,
      avgCols: datasets.length ? Math.round(totalCols / datasets.length) : 0,
      totalRows,
    };
  }, [datasets]);

  const handleOpen = (dataset: Dataset) => {
    setLastDataset({ id: dataset.id, name: dataset.name });
    navigate(`/eda/${dataset.id}`);
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">データセット</h1>
          <p className="text-sm text-slate-500">
            登録済み {summary.count} 件・合計 {summary.totalRows.toLocaleString()} 行 / 平均 {summary.avgCols} 列
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            icon={<FolderOpen className="h-4 w-4" />}
            onClick={() => navigate('/')}
          >
            ワークフローを見る
          </Button>
          <Button
            variant="primary"
            icon={<Upload className="h-4 w-4" />}
            onClick={() => navigate('/')}
          >
            新しいデータセットをアップロード
          </Button>
        </div>
      </header>

      <Card padding="none" className="overflow-hidden">
        <CardHeader className="border-b border-slate-200 px-6 py-4">
          <CardTitle className="text-base">最近利用したデータセット</CardTitle>
          <CardDescription>データセットを選択すると、自動的に最新の EDA ワークフローへ遷移します。</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-6">
              {[...Array(5)].map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : datasets.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
              <Upload className="h-10 w-10 text-slate-300" />
              <p className="text-sm">データセットがまだ登録されていません。まずはアップロードを実行してください。</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">名前</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">行数</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">列数</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">最終更新</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {datasets.map((dataset) => (
                    <tr key={dataset.id} className="transition hover:bg-slate-50">
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900">{dataset.name}</span>
                          <span className="text-xs text-slate-400">ID: {dataset.id}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                        {dataset.rows?.toLocaleString() ?? '-'}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                        {dataset.cols?.toLocaleString() ?? '-'}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                        {formatUpdatedAt(dataset.updatedAt)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<ArrowRight className="h-4 w-4" />}
                          onClick={() => handleOpen(dataset)}
                        >
                          EDA を開始
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
