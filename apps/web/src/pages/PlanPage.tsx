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
  const toast = useToast();

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
        setPlan({ version: data.version ?? 'v1', tasks: data.tasks ?? [] });
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
              {plan.tasks.map((t) => (
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
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">計画がありません</div>
      )}

      <div className="sr-only" aria-live="polite" aria-atomic="true">{validationError ? '検証エラーがあります' : plan ? `計画バージョン ${plan.version}` : ''}</div>
    </div>
  );
}
