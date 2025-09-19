import React, { useCallback, useEffect, useState } from 'react';
import { getLlmCredentialStatus, setLlmCredentials, setLlmActiveProvider, type LlmProvider } from '@autoeda/client-sdk';
import { Button } from '@autoeda/ui-kit';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/Card';
import { ShieldCheck, Lock } from 'lucide-react';

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
};

export function SettingsPage(): JSX.Element {
  const [activeProvider, setActiveProvider] = useState<LlmProvider>('openai');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [providerStates, setProviderStates] = useState<Record<LlmProvider, boolean>>({
    openai: false,
    gemini: false,
  });
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const status = await getLlmCredentialStatus();
      const providers = status.providers ?? {
        openai: { configured: false },
        gemini: { configured: false },
      };
      setActiveProvider(status.provider);
      setConfigured(Boolean(status.configured));
      setProviderStates({
        openai: providers.openai.configured,
        gemini: providers.gemini.configured,
      });
    } catch {
      setConfigured(false);
      setActiveProvider('openai');
      setProviderStates({ openai: false, gemini: false });
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return; // 二重送信ガード
    if (!apiKey.trim()) {
      setError('APIキーを入力してください');
      return;
    }
    const trimmed = apiKey.trim();
    if (trimmed.length < 8) {
      setError('APIキーは8文字以上で入力してください');
      return;
    }
    if (trimmed.startsWith('<')) {
      setError('APIキーにプレースホルダ（<...>）が含まれています');
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await setLlmCredentials(activeProvider, trimmed);
      setApiKey('');
      await loadStatus();
      setMessage('設定が更新されました');
    } catch (err) {
      const detail = err instanceof Error ? err.message : '更新に失敗しました';
      // より読みやすく（Pydantic配列など）
      setError(String(detail));
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchProvider = async () => {
    if (!providerStates[activeProvider]) {
      setError(`${PROVIDER_LABELS[activeProvider]} の API Key を先に保存してください`);
      return;
    }
    if (switching) return;
    setSwitching(true);
    setMessage(null);
    setError(null);
    try {
      await setLlmActiveProvider(activeProvider);
      await loadStatus();
      setMessage(`使用プロバイダを ${PROVIDER_LABELS[activeProvider]} に切り替えました`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '切り替えに失敗しました');
    } finally {
      setSwitching(false);
    }
  };

  const statusLabel = configured === null ? '読み込み中' : configured ? '設定済み' : '未設定';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card padding="lg">
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-3 text-lg">
            <ShieldCheck className="h-5 w-5 text-brand-600" />
            システム設定
          </CardTitle>
          <CardDescription>
            現在の状態: {statusLabel}（使用中: {PROVIDER_LABELS[activeProvider]}）。API Key は `config/credentials.json` に保存され、リポジトリには含まれません。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="text-xs uppercase tracking-widest text-slate-400">プロバイダ別ステータス</p>
            <ul className="mt-2 space-y-1">
              {Object.entries(providerStates).map(([provider, state]) => (
                <li key={provider} className="flex items-center justify-between">
                  <span>{PROVIDER_LABELS[provider as LlmProvider]}</span>
                  <span className={state ? 'text-emerald-600' : 'text-slate-400'}>
                    {state ? '設定済み' : '未設定'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4">
            <label className="flex flex-col gap-2 text-sm text-slate-600">
              <span>使用する LLM プロバイダ</span>
              <select
                value={activeProvider}
                onChange={(event) => setActiveProvider(event.target.value as LlmProvider)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                <option value="openai">OpenAI</option>
                <option value="gemini">Google Gemini</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-600">
              <span>{PROVIDER_LABELS[activeProvider]} API Key</span>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="llm-key"
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={activeProvider === 'openai' ? 'sk-...' : 'gm-...'}
                  autoComplete="off"
                  className="w-full rounded-xl border border-slate-200 px-10 py-2 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  aria-label={`${PROVIDER_LABELS[activeProvider]} API Key`}
                />
              </div>
            </label>
            {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" loading={switching} onClick={handleSwitchProvider}>
                使用プロバイダを適用
              </Button>
              <Button type="submit" variant="primary" loading={saving}>
                保存
              </Button>
            </div>
          </form>
        </CardContent>
        <CardFooter className="text-xs text-slate-500">
          `AUTOEDA_CREDENTIALS_FILE` を設定すると、環境ごとに認証情報を切り替えられます。
        </CardFooter>
      </Card>
    </div>
  );
}
