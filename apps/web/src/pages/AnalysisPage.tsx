import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, useToast } from '@autoeda/ui-kit';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { deepDive, runCustomAnalysis, type DeepDiveSuggestion } from '@autoeda/client-sdk';
import { VegaView } from '../components/vis/VegaView';

export function AnalysisPage() {
  const { datasetId } = useParams();
  const toast = useToast();
  const [prompt, setPrompt] = useState('売上のトレンドと相関を見たい');
  const [suggs, setSuggs] = useState<DeepDiveSuggestion[]>([]);
  const [suggOutputs, setSuggOutputs] = useState<Record<number, Output[]>>({});
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [inflight, setInflight] = useState(false);

  const defaultCode = useMemo(() => (
`# 入力: in.json から csv_path が渡されます
import json, csv
cfg = json.loads(open('in.json','r',encoding='utf-8').read())
csv_path = cfg.get('csv_path')
values = []
try:
  rdr = csv.reader(open(csv_path,'r',encoding='utf-8')) if csv_path else []
  headers = next(rdr, None)
  for i,row in zip(range(12), rdr):
    try:
      values.append({'x': i, 'y': float(row[0]) if row else i%5+1})
    except Exception:
      values.append({'x': i, 'y': i%5+1})
except Exception:
  values = [{'x': i, 'y': (i%5)+1} for i in range(12)]
spec = {'$schema':'https://vega.github.io/schema/vega-lite/v5.json','mark':'line','data':{'name':'data'},'encoding':{'x':{'field':'x','type':'quantitative'},'y':{'field':'y','type':'quantitative'}}, 'datasets':{'data': values}}
print(json.dumps({'language':'python','library':'vega','outputs':[{'type':'vega','mime':'application/json','content':spec}]}))
`
  ), []);

  const [code, setCode] = useState(defaultCode);
  const [running, setRunning] = useState(false);
  type Output = { type: 'text'|'image'|'vega'; mime: string; content: unknown };
  const [outputs, setOutputs] = useState<Output[]>([]);

  async function onSuggest() {
    if (!datasetId) return;
    setInflight(true);
    try {
      const res = await deepDive(datasetId, prompt);
      setSuggs(res.suggestions || []);
      toast('提案を取得しました', 'success');
    } catch {
      toast('提案の取得に失敗しました', 'error');
    } finally {
      setInflight(false);
    }
  }

  function applySuggestion(s: DeepDiveSuggestion) {
    const spec = JSON.stringify(s.spec ?? {}, null, 0);
    const snippet = `import json\nspec = ${spec}\nprint(json.dumps({'language':'python','library':'vega','outputs':[{'type':'vega','mime':'application/json','content':spec}]}))`;
    setCode(snippet);
    toast('提案をコードに反映しました', 'info');
  }

  async function runSuggestion(index: number, s: DeepDiveSuggestion) {
    if (!datasetId) return;
    try {
      // spec から JSON出力する最小スニペットを合成
      const spec = JSON.stringify(s.spec ?? {}, null, 0);
      const snippet = `import json\nspec = ${spec}\nprint(json.dumps({'language':'python','library':'vega','outputs':[{'type':'vega','mime':'application/json','content':spec}]}))`;
      const res = await runCustomAnalysis(datasetId, snippet, `sugg-${index}`);
      const outs: Output[] = Array.isArray(res.outputs) ? res.outputs.map((o) => ({
        type: (o.type === 'vega' || o.type === 'image' || o.type === 'text') ? o.type : 'text',
        mime: String(o.mime ?? ''),
        content: o.content as unknown,
      })) : [];
      if (res.status === 'succeeded') {
        setSuggOutputs((m) => ({ ...m, [index]: outs }));
        toast('提案を実行しました', 'success');
      } else {
        const map: Record<string, string> = {
          timeout: '実行がタイムアウトしました（制限超過）。',
          cancelled: '実行がキャンセルされました。',
          forbidden_import: '安全ポリシーにより禁止されたモジュール/関数が検出されました。',
          format_error: '出力形式が不正です（JSON解析に失敗）。',
          unknown: '不明なエラーが発生しました。',
        };
        const msg = (res as any).error_code ? (map[(res as any).error_code] ?? '失敗しました') : (res.logs?.[0] ?? '失敗しました');
        toast(msg, 'error');
      }
    } catch {
      toast('提案の実行に失敗しました', 'error');
    }
  }

  async function onRun() {
    if (!datasetId) return;
    setRunning(true);
    try {
      const res = await runCustomAnalysis(datasetId, code, 'adhoc');
      const outs: Output[] = Array.isArray(res.outputs) ? res.outputs.map((o) => {
        const t = (o.type === 'vega' || o.type === 'image' || o.type === 'text') ? o.type : 'text';
        const mapped: Output = { type: t, mime: String(o.mime ?? ''), content: o.content as unknown };
        return mapped;
      }) : [];
      setOutputs(outs);
      if (res.status === 'succeeded') toast('実行に成功しました', 'success');
      else {
        const map: Record<string, string> = {
          timeout: '実行がタイムアウトしました（制限超過）。',
          cancelled: '実行がキャンセルされました。',
          forbidden_import: '安全ポリシーにより禁止されたモジュール/関数が検出されました。',
          format_error: '出力形式が不正です（JSON解析に失敗）。',
          unknown: '不明なエラーが発生しました。',
        };
        const msg = (res as any).error_code ? (map[(res as any).error_code] ?? '失敗しました') : (res.logs?.[0] ?? '失敗しました');
        toast(msg, 'error');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : '実行に失敗しました', 'error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>深掘りの提案（G2）</CardTitle>
          <CardDescription>プロンプトから決定的なサジェストを返します。必要に応じてコードに反映できます。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            <textarea className="w-full rounded-lg border border-slate-300 p-2 text-sm" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            <div>
              <Button variant="primary" onClick={onSuggest} disabled={inflight}>提案を取得</Button>
            </div>
            <div className="grid gap-3">
              {suggs.map((s, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{s.title}</div>
                      {s.why && <div className="text-xs text-slate-600">{s.why}</div>}
                      {Array.isArray((s as any).tags) && (s as any).tags.length>0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(s as any).tags.map((t: string, k: number)=>(<span key={k} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">{t}</span>))}
                        </div>
                      ) : null}
                      {(s as any).diagnostics ? (
                        <div className="mt-1 text-[11px] text-slate-600">{Object.entries((s as any).diagnostics as Record<string, unknown>).map(([k,v])=>`${k}: ${String(v)}`).join(' / ')}</div>
                      ) : null}
                    </div>
                    <input type="checkbox" aria-label="選択" checked={!!selected[i]} onChange={(e)=>setSelected((m)=>({...m,[i]:e.target.checked}))} />
                  </div>
                  {s.spec ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-slate-600 underline">spec を表示</summary>
                      <pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-[11px]">{JSON.stringify(s.spec, null, 2)}</pre>
                    </details>
                  ) : null}
                  <div className="mt-2 flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => applySuggestion(s)}>コードに反映</Button>
                    <Button variant="primary" size="sm" onClick={() => runSuggestion(i, s)}>この提案を実行</Button>
                  </div>
                  {Array.isArray(suggOutputs[i]) && suggOutputs[i]!.length > 0 ? (
                    <div className="mt-3 grid gap-2">
                      {suggOutputs[i]!.map((o, j) => (
                        <div key={j} className="rounded border border-slate-200 p-2">
                          <div className="mb-1 text-xs text-slate-500">{o.type} · {o.mime}</div>
                          {o.type === 'text' && typeof o.content === 'string' ? (
                            <pre className="max-h-40 overflow-auto rounded bg-slate-50 p-2 text-[11px]">{o.content as string}</pre>
                          ) : null}
                          {o.mime === 'image/svg+xml' && typeof o.content === 'string' ? (
                            <img alt="result" src={`data:image/svg+xml;utf8,${encodeURIComponent(o.content as string)}`} className="rounded border" />
                          ) : null}
                          {o.type === 'vega' && o.content ? (
                            <VegaView spec={o.content as object} className="rounded border" />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {suggs.length>0 ? (
              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-slate-600">選択: {Object.values(selected).filter(Boolean).length} / {suggs.length}</div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={async ()=>{
                    if (!datasetId) return;
                    const idxs = Object.entries(selected).filter(([,v])=>v).map(([k])=>Number(k)).sort((a,b)=>a-b);
                    if (idxs.length===0) return;
                    setInflight(true);
                    try {
                      for (const i of idxs) {
                        await runSuggestion(i, suggs[i]!);
                      }
                      toast('選択した提案を実行しました', 'success');
                    } finally {
                      setInflight(false);
                    }
                  }}
                >選択を一括実行</Button>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>カスタム実行（G1）</CardTitle>
          <CardDescription>安全なサンドボックスで Python スニペットを実行します（JSON出力必須）。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            <textarea className="w-full rounded-lg border border-slate-300 p-2 text-sm" rows={12} value={code} onChange={(e) => setCode(e.target.value)} />
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span>テンプレ:</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const t = `# 移動平均（ウィンドウ=3）\nimport json, csv\ncfg=json.loads(open('in.json','r',encoding='utf-8').read())\ncsv_path=cfg.get('csv_path')\nvals=[]\ntry:\n  rdr=csv.reader(open(csv_path,'r',encoding='utf-8')) if csv_path else []\n  next(rdr,None)\n  for i,row in zip(range(30),rdr):\n    try:\n      vals.append(float(row[0]))\n    except: vals.append(i%5+1)\nexcept: vals=[(i%5)+1 for i in range(30)]\nma=[sum(vals[max(0,i-2):i+1])/len(vals[max(0,i-2):i+1]) for i in range(len(vals))]\nspec={'$schema':'https://vega.github.io/schema/vega-lite/v5.json','data':{'name':'data'},'layer':[{'mark':'line','encoding':{'x':{'field':'x','type':'quantitative'},'y':{'field':'y','type':'quantitative'}}},{'mark':{'type':'line','stroke':'#ef4444'},'encoding':{'x':{'field':'x','type':'quantitative'},'y':{'field':'ma','type':'quantitative'}}}], 'datasets':{'data':[{'x':i,'y':vals[i],'ma':ma[i]} for i in range(len(vals))]}}\nprint(json.dumps({'language':'python','library':'vega','outputs':[{'type':'vega','mime':'application/json','content':spec}]}))`;
                  setCode(t);
                }}
              >移動平均</Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const t = `# 相関行列ヒートマップ（疑似データ）\nimport json\nvars=['A','B','C','D']\nvals=[{'row':r,'col':c,'v':(i+j)%5} for i,r in enumerate(vars) for j,c in enumerate(vars)]\nspec={'$schema':'https://vega.github.io/schema/vega-lite/v5.json','data':{'name':'data'},'mark':'rect','encoding':{'x':{'field':'row','type':'ordinal'},'y':{'field':'col','type':'ordinal'},'color':{'field':'v','type':'quantitative'}}, 'datasets':{'data':vals}}\nprint(json.dumps({'language':'python','library':'vega','outputs':[{'type':'vega','mime':'application/json','content':spec}]}))`;
                  setCode(t);
                }}
              >相関行列</Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={onRun} disabled={running || !datasetId}>実行</Button>
              <span className="text-xs text-slate-500">in.json（csv_path, dataset_id）を参照できます</span>
            </div>
            <div className="grid gap-2">
              {outputs.map((o, idx) => (
                <div key={idx} className="rounded-lg border border-slate-200 p-2">
                  <div className="mb-1 text-xs text-slate-500">{o.type} · {o.mime}</div>
                  {o.type === 'text' && typeof o.content === 'string' ? (
                    <pre className="max-h-40 overflow-auto rounded bg-slate-50 p-2 text-[11px]">{o.content}</pre>
                  ) : null}
                  {o.mime === 'image/svg+xml' && typeof o.content === 'string' ? (
                    <img alt="result" src={`data:image/svg+xml;utf8,${encodeURIComponent(o.content)}`} className="rounded border" />
                  ) : null}
                  {o.type === 'vega' && o.content ? (
                    <VegaView spec={o.content} className="rounded border" />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
