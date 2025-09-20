import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, useToast } from '@autoeda/ui-kit';
import { Pill } from '../components/ui/Pill';

type PlanTask = { id: string; title: string; why?: string; tool?: string; depends_on?: string[]; acceptance?: string };
type PlanModel = { version: string; tasks: PlanTask[] };

export function PlanPage() {
  const { datasetId } = useParams();
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<PlanModel | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [issuesMap, setIssuesMap] = useState<Record<string, string[]>>({});
  const [sortKey, setSortKey] = useState<'id'|'title'|'tool'>(() => {
    const q = new URLSearchParams(window.location.search);
    const qs = q.get('sort');
    if (qs === 'title' || qs === 'tool') return qs;
    const v = localStorage.getItem('plan.sortKey');
    return (v === 'title' || v === 'tool') ? v : 'id';
  });
  const [filterText, setFilterText] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    const qf = q.get('q');
    if (qf) return qf;
    return localStorage.getItem('plan.filterText') ?? '';
  });
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
                  // 例: "missing dependency: a depends on b; ambiguous acceptance in t1"
                  const map: Record<string,string[]> = {};
                  msg.split(';').map((s: string) => s.trim()).filter((s: string) => Boolean(s)).forEach((line: string) => {
                    const m1 = line.match(/^missing dependency: (\S+) depends on (\S+)/);
                    const m2 = line.match(/^ambiguous acceptance in (\S+)/);
                    const m3 = line.match(/^cycle detected at (\S+)/);
                    if (m1) { const id=m1[1]; (map[id] ||= []).push(line); }
                    else if (m2) { const id=m2[1]; (map[id] ||= []).push(line); }
                    else if (m3) { const id=m3[1]; (map[id] ||= []).push(line); }
                  });
                  setIssuesMap(map);
                  toast('検証エラーがあります', 'error');
                } else {
                  const obj = await res.json();
                  setPlan({ version: obj.version, tasks: obj.tasks ?? [] });
                  setIssuesMap({});
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
              <select className="rounded border border-slate-300 px-2 py-1" value={sortKey} onChange={(e) => { const val = e.target.value as 'id'|'title'|'tool'; setSortKey(val); localStorage.setItem('plan.sortKey', val); }}>
                <option value="id">ID</option>
                <option value="title">タイトル</option>
                <option value="tool">ツール</option>
              </select>
            </label>
            <label className="ml-2 flex items-center gap-1">
              <span className="text-slate-500">フィルタ:</span>
              <input className="rounded border border-slate-300 px-2 py-1" placeholder="キーワード" value={filterText} onChange={(e) => { setFilterText(e.target.value); localStorage.setItem('plan.filterText', e.target.value); }} />
            </label>
          </div>
          <div className="mb-3 text-sm text-slate-500">version: {plan.version}</div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-slate-500">
                <th className="px-2 py-1">状態</th>
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
                .map((t) => {
                  const deps = t.depends_on ?? [];
                  const ids = new Set(plan.tasks.map((x) => x.id));
                  const okDeps = deps.every((d) => ids.has(d));
                  const issues = issuesMap[t.id] ?? [];
                  const ok = okDeps && issues.length === 0;
                  return (
                <tr key={t.id} className={`border-t border-slate-100 ${ok ? '' : 'bg-amber-50'}`} title={issues.join('; ')}>
                  <td className="px-2 py-1">{ok ? <Pill tone="emerald">OK</Pill> : <Pill tone="amber">NG</Pill>}</td>
                  <td className="px-2 py-1 font-mono text-xs">{t.id}</td>
                  <td className="px-2 py-1">{t.title}</td>
                  <td className="px-2 py-1 text-slate-600">{t.tool ?? '-'}</td>
                  <td className="px-2 py-1 text-slate-600">{deps.join(', ') || '-'}</td>
                  <td className="px-2 py-1 text-slate-600">{t.acceptance ?? '-'}</td>
                </tr>
              )})}
            </tbody>
          </table>
          {missingDeps.length > 0 ? (
            <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              依存未解決: {missingDeps.slice(0,5).join(', ')}{missingDeps.length>5?' …':''}
            </div>
          ) : null}
          <div className="mt-3 text-xs text-slate-500">
            <p className="font-semibold text-slate-600">依存グラフ（簡易 SVG）</p>
            {(() => {
              const nodes = plan.tasks.map((t, i) => ({ id: t.id, x: 20 + (i%8)*60, y: 20 + Math.floor(i/8)*50 }));
              const pos = new Map(nodes.map((n) => [n.id, n] as const));
              const edges: { from: string; to: string }[] = [];
              plan.tasks.forEach((t) => (t.depends_on ?? []).forEach((d) => edges.push({ from: d, to: t.id })));
              const w = 520; const h = Math.max(80, 20 + Math.ceil(nodes.length/8)*50);
              return (
                <svg width={w} height={h} className="mt-2 rounded border border-slate-200 bg-white">
                  {edges.map((e, idx) => {
                    const a = pos.get(e.from); const b = pos.get(e.to);
                    if (!a || !b) return null;
                    return <line key={`e-${idx}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#94a3b8" strokeWidth={1} />
                  })}
                  {nodes.map((n) => (
                    <g key={`n-${n.id}`}>
                      <circle cx={n.x} cy={n.y} r={7} fill="#1e293b" />
                      <text x={n.x+10} y={n.y+4} fontSize={10} fill="#334155" className="font-mono">{n.id}</text>
                    </g>
                  ))}
                </svg>
              );
            })()}
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
            <Button
              variant="secondary"
              size="sm"
              className="ml-2"
              onClick={() => {
                // issues.csv: id, title, tool, issue
                const header = ['id','title','tool','issue'];
                const rows = Object.entries(issuesMap).flatMap(([id, arr]) => {
                  const t = (plan?.tasks ?? []).find(x => x.id === id);
                  const title = t?.title ?? '';
                  const tool = t?.tool ?? '';
                  return (arr as string[]).map((msg: string) => [id, title, tool, msg] as [string,string,string,string]);
                });
                if (rows.length === 0) return;
                const esc = (s: string) => `"${String(s).replace(/"/g,'""')}"`;
                const csv = [header.join(','), ...rows.map(([a,b,c,d]) => [esc(a),esc(b),esc(c),esc(d)].join(','))].join('\n');
                const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
                const a = document.createElement('a'); a.href = url; a.download = `issues_${datasetId}.csv`; a.click(); URL.revokeObjectURL(url);
              }}
            >issues.csv</Button>
            <Button
              variant="secondary"
              size="sm"
              className="ml-2"
              onClick={() => {
                if (!plan) return;
                const header = ['id','title','tool','depends_on','acceptance'];
                const rows = plan.tasks.map(t => [t.id, t.title, t.tool??'', (t.depends_on??[]).join('|'), t.acceptance??'']);
                const csv = [header.join(','), ...rows.map(r => r.map(v => String(v).replace(/"/g,'""')).map(v=>`"${v}"`).join(','))].join('\n');
                const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
                const a = document.createElement('a'); a.href = url; a.download = `plan_${datasetId}.csv`; a.click(); URL.revokeObjectURL(url);
              }}
            >CSV エクスポート</Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">計画がありません</div>
      )}

      <div className="sr-only" aria-live="polite" aria-atomic="true">{validationError ? '検証エラーがあります' : plan ? `計画バージョン ${plan.version}` : ''}</div>
    </div>
  );
}
