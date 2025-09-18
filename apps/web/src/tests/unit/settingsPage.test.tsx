import { describe, expect, it, vi, beforeEach, type MockedFunction } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('@autoeda/client-sdk', () => ({
  getLlmCredentialStatus: vi.fn(),
  setLlmCredentials: vi.fn(),
}));

import { SettingsPage } from '../../pages/SettingsPage';
import { getLlmCredentialStatus, setLlmCredentials } from '@autoeda/client-sdk';

const mockedGetStatus = getLlmCredentialStatus as unknown as MockedFunction<typeof getLlmCredentialStatus>;
const mockedSetKey = setLlmCredentials as unknown as MockedFunction<typeof setLlmCredentials>;

describe('SettingsPage', () => {
  beforeEach(() => {
    mockedGetStatus.mockReset();
    mockedSetKey.mockReset();
  });

  it('表示時に現在の設定状態を読み込む', async () => {
    mockedGetStatus.mockResolvedValue({
      provider: 'openai',
      configured: false,
      providers: {
        openai: { configured: false },
        gemini: { configured: false },
      },
    });
    render(<SettingsPage />);

    expect(await screen.findByText(/現在の状態: 未設定/)).toBeTruthy();
    expect((await screen.findAllByText('OpenAI')).length).toBeGreaterThanOrEqual(1);
    expect((await screen.findAllByText('Google Gemini')).length).toBeGreaterThanOrEqual(1);
    const unconfigured = await screen.findAllByText('未設定');
    expect(unconfigured.length).toBeGreaterThanOrEqual(2);
  });

  it('APIキーを送信すると設定済みに更新される', async () => {
    mockedGetStatus.mockResolvedValueOnce({
      provider: 'openai',
      configured: false,
      providers: {
        openai: { configured: false },
        gemini: { configured: false },
      },
    });
    mockedGetStatus.mockResolvedValueOnce({
      provider: 'gemini',
      configured: true,
      providers: {
        openai: { configured: false },
        gemini: { configured: true },
      },
    });
    mockedSetKey.mockResolvedValue();

    render(<SettingsPage />);

    const providerSelect = await screen.findByLabelText(/使用する LLM プロバイダ/);
    fireEvent.change(providerSelect, { target: { value: 'gemini' } });

    const input = await screen.findByLabelText(/Gemini.*API Key/);
    fireEvent.change(input, { target: { value: 'gm-test-abc123456789' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(mockedSetKey).toHaveBeenCalledWith('gemini', 'gm-test-abc123456789');
    });

    expect(await screen.findByText('設定が更新されました')).toBeTruthy();
    expect(await screen.findByText(/現在の状態: 設定済み/)).toBeTruthy();
  });
});
