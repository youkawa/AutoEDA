import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, useToast } from '@autoeda/ui-kit';

type PlanTask = { id: string; title: string; why?: string; tool?: string; depends_on?: string[]; acceptance?: string };
type PlanModel = { version: string; tasks: PlanTask[] };

export function PlanPage() {
  const { datasetId } = useParams();
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<PlanModel | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<'id'|'title'|'tool'>('id');
  const [filterText, setFilterText] = useState('');
  const toast = useToast();
  const [missingDeps, setMissingDeps] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    if (!datasetId) return;
    setLoading(true);
    const apiBase = ((import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE) ?? '';
    fetch(`${apiBase}/api/plan/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dataset_id: datasetId, top_k: 3 }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((obj: unknown) => {
        const data = obj as { version?: string; tasks?: PlanTask[] };
        if (!mounted) return;
        const tasks = data.tasks ?? [];
        setPlan({ version: data.version ?? 'v1', tasks });
        // compute missing deps (UI用の即席検証)
        const ids = new Set(tasks.map((t) => t.id));
        const missing: string[] = [];
        tasks.forEach((t) => (t.depends_on ?? []).forEach((d) => { if (!ids.has(d)) missing.push(`${t.id} -> ${d}`); }));
        setMissingDeps(missing);
      })
      .catch((err) => {
        toast(err instanceof Error ? err.message : '計画の取得に失敗しました', 'error');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
        mounted = false;
    };
  }, [datasetId]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">EDA 計画</h1>
          <p className="text-sm text-slate-500">データセット {datasetId}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            loading={loading}
            onClick={async () => {
              if (!datasetId || !plan) return;
              setValidationError(null);
              try {
                const apiBase2 = ((import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE) ?? '';
                const res = await fetch(`${apiBase2}/api/plan/revise`, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ plan, instruction: '' }),
                });
                if (!res.ok) {
                  const body = await res.json().catch(() => ({}));
                  const msg = typeof body?.detail === 'string' ? body.detail : `HTTP ${res.status}`;
                  setValidationError(msg);
                  toast('検証エラーがあります', 'error');
                } else {
                  const obj = await res.json();
                  setPlan({ version: obj.version, tasks: obj.tasks ?? [] });
                  toast('計画は有効です', 'success');
                }
              } catch (err) {
                toast(err instanceof Error ? err.message : '計画の検証に失敗しました', 'error');
              }
            }}
          >
            検証（循環/未解決/曖昧）
          </Button>
        </div>
      </header>

      {validationError ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">{validationError}</div>
      ) : null}

      {loading ? (
        <div className="h-48 animate-pulse rounded-2xl bg-white" />
      ) : plan ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-3 text-sm">
            <label className="flex items-center gap-1">
              <span className="text-slate-500">ソート:</span>
              <select className="rounded border border-slate-300 px-2 py-1" value={sortKey} onChange={(e) => setSortKey(e.target.value as 'id'|'title'|'tool')}>
                <option value="id">ID</option>
                <option value="title">タイトル</option>
                <option value="tool">ツール</option>
              </select>
            </label>
            <label className="ml-2 flex items-center gap-1">
              <span className="text-slate-500">フィルタ:</span>
              <input className="rounded border border-slate-300 px-2 py-1" placeholder="キーワード" value={filterText} onChange={(e) => setFilterText(e.target.value)} />
            </label>
          </div>
          <div className="mb-3 text-sm text-slate-500">version: {plan.version}</div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-slate-500">
                <th className="px-2 py-1">ID</th>
                <th className="px-2 py-1">タイトル</th>
                <th className="px-2 py-1">ツール</th>
                <th className="px-2 py-1">依存</th>
                <th className="px-2 py-1">受入</th>
              </tr>
            </thead>
            <tbody>
              {[...plan.tasks]
                .filter((t) => {
                  const q = filterText.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    t.id.toLowerCase().includes(q) ||
                    (t.title ?? '').toLowerCase().includes(q) ||
                    (t.tool ?? '').toLowerCase().includes(q)
                  );
                })
                .sort((a,b) => {
                  const va = (a[sortKey] ?? '').toString().toLowerCase();
                  const vb = (b[sortKey] ?? '').toString().toLowerCase();
                  return va.localeCompare(vb);
                })
                .map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-2 py-1 font-mono text-xs">{t.id}</td>
                  <td className="px-2 py-1">{t.title}</td>
                  <td className="px-2 py-1 text-slate-600">{t.tool ?? '-'}</td>
                  <td className="px-2 py-1 text-slate-600">{(t.depends_on ?? []).join(', ') || '-'}</td>
                  <td className="px-2 py-1 text-slate-600">{t.acceptance ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {missingDeps.length > 0 ? (
            <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              依存未解決: {missingDeps.slice(0,5).join(', ')}{missingDeps.length>5?' …':''}
            </div>
          ) : null}
          <div className="mt-3 text-xs text-slate-500">
            <p className="font-semibold text-slate-600">依存グラフ（簡易）</p>
            <ul className="mt-1 list-disc pl-5">
              {plan.tasks.map((t) => (
                <li key={`dep-${t.id}`}>
                  <span className="font-mono">{t.id}</span>
                  <span className="mx-1">→</span>
                  <span>{(t.depends_on ?? []).join(', ') || '-'}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `plan_${datasetId}.json`; a.click(); URL.revokeObjectURL(url);
              }}
            >計画JSONをダウンロード</Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">計画がありません</div>
      )}

      <div className="sr-only" aria-live="polite" aria-atomic="true">{validationError ? '検証エラーがあります' : plan ? `計画バージョン ${plan.version}` : ''}</div>
    </div>
  );
}
