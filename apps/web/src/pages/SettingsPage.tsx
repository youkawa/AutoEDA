import React, { useEffect, useState } from 'react';
import { getLlmCredentialStatus, setOpenAIApiKey } from '@autoeda/client-sdk';

export function SettingsPage(): JSX.Element {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const status = await getLlmCredentialStatus();
        if (mounted) {
          setConfigured(Boolean(status?.configured));
        }
      } catch {
        if (mounted) setConfigured(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

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
      await setOpenAIApiKey(apiKey.trim());
      setConfigured(true);
      setMessage('設定が更新されました');
      setApiKey('');
    } catch (err) {
      const detail = err instanceof Error ? err.message : '更新に失敗しました';
      setError(detail);
    } finally {
      setSaving(false);
    }
  };

  const statusLabel = configured === null ? '読み込み中' : configured ? '設定済み' : '未設定';

  return (
    <section style={{ maxWidth: 520 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>システム設定</h1>
      <p style={{ marginBottom: 8 }}>現在の状態: {statusLabel}</p>
      <p style={{ marginBottom: 24, color: '#4b5563' }}>
        OpenAI API Key は暗号化せずローカルファイル (`config/credentials.json`) に保存されます。共有リポジトリには含まれません。
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
        <label htmlFor="openai-key" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>OpenAI API Key</span>
          <input
            id="openai-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
            autoComplete="off"
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
            aria-label="OpenAI API Key"
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
