import React, { useCallback, useEffect, useState } from 'react';
import { getLlmCredentialStatus, setLlmCredentials, type LlmProvider } from '@autoeda/client-sdk';

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  openai: 'OpenAI',
  gemini: 'Gemini',
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
    if (!apiKey.trim()) {
      setError('APIキーを入力してください');
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await setLlmCredentials(activeProvider, apiKey.trim());
      setApiKey('');
      await loadStatus();
      setMessage('設定が更新されました');
    } catch (err) {
      const detail = err instanceof Error ? err.message : '更新に失敗しました';
      setError(detail);
    } finally {
      setSaving(false);
    }
  };

  const statusLabel = configured === null ? '読み込み中' : configured ? '設定済み' : '未設定';

  return (
    <section style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>システム設定</h1>
      <p style={{ marginBottom: 8 }}>現在の状態: {statusLabel}（使用中: {PROVIDER_LABELS[activeProvider]}）</p>
      <p style={{ marginBottom: 16, color: '#4b5563' }}>
        LLM の API Key はローカルファイル (`config/credentials.json`) に保存され、リポジトリには含まれません。
      </p>
      <div style={{ marginBottom: 20, padding: 12, border: '1px solid #e5e7eb', borderRadius: 6 }}>
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 16 }}>プロバイダ別ステータス</h2>
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {Object.entries(providerStates).map(([provider, state]) => (
            <li key={provider}>
              {PROVIDER_LABELS[provider as LlmProvider]} — {state ? '設定済み' : '未設定'}
            </li>
          ))}
        </ul>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
        <label htmlFor="provider-select" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>使用する LLM プロバイダ</span>
          <select
            id="provider-select"
            value={activeProvider}
            onChange={(event) => setActiveProvider(event.target.value as LlmProvider)}
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
          >
            <option value="openai">OpenAI</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </label>
        <label htmlFor="llm-key" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>{PROVIDER_LABELS[activeProvider]} API Key</span>
          <input
            id="llm-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={activeProvider === 'openai' ? 'sk-...' : 'gm-...'}
            autoComplete="off"
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
            aria-label={`${PROVIDER_LABELS[activeProvider]} API Key`}
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          style={{
            backgroundColor: '#2563eb',
            color: 'white',
            padding: '10px 16px',
            borderRadius: 6,
            border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </form>
      {message && <p style={{ marginTop: 16, color: '#16a34a' }}>{message}</p>}
      {error && <p style={{ marginTop: 16, color: '#dc2626' }}>{error}</p>}
    </section>
  );
}
