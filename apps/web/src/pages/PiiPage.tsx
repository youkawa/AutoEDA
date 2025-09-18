import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { piiScan, applyPiiPolicy } from '@autoeda/client-sdk';
import type { PIIScanResult } from '@autoeda/schemas';
import { Button, useToast } from '@autoeda/ui-kit';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/Card';
import { useLastDataset } from '../contexts/LastDatasetContext';

type MaskPolicy = 'MASK' | 'HASH' | 'DROP';

export function PiiPage() {
  const { datasetId } = useParams();
  const { setLastDataset } = useLastDataset();
  const toast = useToast();
  const [result, setResult] = useState<PIIScanResult | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [policy, setPolicy] = useState<MaskPolicy>('MASK');
  const [loading, setLoading] = useState(false);
  const defaults = useMemo(() => ['email', 'phone', 'ssn'], []);

  useEffect(() => {
    if (!datasetId) return;
    setLastDataset({ id: datasetId });
    void piiScan(datasetId, defaults).then((res) => {
      setResult(res);
      setSelected(res.masked_fields.length ? res.masked_fields : res.detected_fields);
      setPolicy(res.mask_policy as MaskPolicy);
    });
  }, [datasetId, defaults, setLastDataset]);

  const onToggle = (field: string) => {
    setSelected((prev) => (prev.includes(field) ? prev.filter((v) => v !== field) : [...prev, field]));
  };

  const onApply = async () => {
    if (!datasetId) return;
    setLoading(true);
    try {
      const applied = await applyPiiPolicy(datasetId, policy, selected);
      const updated = await piiScan(datasetId, defaults);
      setResult({ ...updated, masked_fields: applied.masked_fields, mask_policy: applied.mask_policy, updated_at: applied.updated_at });
      toast('PII方針を適用しました', 'success');
    } finally {
      setLoading(false);
    }
  };

  const maskPolicies: { value: MaskPolicy; label: string; description: string }[] = [
    { value: 'MASK', label: 'マスク', description: '*** で置換し、元データは保持' },
    { value: 'HASH', label: 'ハッシュ', description: '再識別が必要な場合に使用' },
    { value: 'DROP', label: '削除', description: '高リスク項目は完全削除' },
  ];

  return (
    <div className="space-y-6">
      <Card padding="lg" className="space-y-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-lg">
            <ShieldCheck className="h-5 w-5 text-brand-600" />
            PII スキャン結果
          </CardTitle>
          <CardDescription>検出された個人情報を確認し、マスクポリシーを適用します。</CardDescription>
        </CardHeader>
        {!result ? (
          <CardContent>
            <p className="text-sm text-slate-500">スキャン中...</p>
          </CardContent>
        ) : (
          <CardContent className="space-y-6">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">検出フィールド</p>
              {result.detected_fields.length === 0 ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  PII は検出されませんでした。
                </div>
              ) : (
                <div className="space-y-2">
                  {result.detected_fields.map((field) => (
                    <label
                      key={field}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                    >
                      <span>{field}</span>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        checked={selected.includes(field)}
                        onChange={() => onToggle(field)}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">マスクポリシー</p>
              <div className="grid gap-3 md:grid-cols-3">
                {maskPolicies.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPolicy(option.value)}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                      policy === option.value
                        ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:bg-brand-50/60'
                    }`}
                  >
                    <p className="font-semibold">{option.label}</p>
                    <p className="text-xs text-slate-500">{option.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <p className="text-xs uppercase tracking-widest text-slate-400">適用済み</p>
                <p>{result.masked_fields.join(', ') || 'なし'}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <p className="text-xs uppercase tracking-widest text-slate-400">最終更新</p>
                <p>{result.updated_at ? new Date(result.updated_at).toLocaleString() : '未登録'}</p>
              </div>
            </div>
          </CardContent>
        )}
        <CardFooter className="justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> 適用後は `data/datasets/*.meta.json` に記録されます。
          </div>
          <Button variant="primary" loading={loading} onClick={onApply}>
            マスクを適用して再計算
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
