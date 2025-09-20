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
      else toast(res.logs?.[0] ?? '実行に失敗しました', 'error');
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
                  <div className="text-sm font-semibold">{s.title}</div>
                  {s.why && <div className="text-xs text-slate-600">{s.why}</div>}
                  {s.spec ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-slate-600 underline">spec を表示</summary>
                      <pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-[11px]">{JSON.stringify(s.spec, null, 2)}</pre>
                    </details>
                  ) : null}
                  <div className="mt-2">
                    <Button variant="secondary" size="sm" onClick={() => applySuggestion(s)}>コードに反映</Button>
                  </div>
                </div>
              ))}
            </div>
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
