import { describe, expect, it, vi, beforeEach, type MockedFunction } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('@autoeda/client-sdk', () => ({
  getLlmCredentialStatus: vi.fn(),
  setOpenAIApiKey: vi.fn(),
}));

import { SettingsPage } from '../../pages/SettingsPage';
import { getLlmCredentialStatus, setOpenAIApiKey } from '@autoeda/client-sdk';

const mockedGetStatus = getLlmCredentialStatus as unknown as MockedFunction<typeof getLlmCredentialStatus>;
const mockedSetKey = setOpenAIApiKey as unknown as MockedFunction<typeof setOpenAIApiKey>;

describe('SettingsPage', () => {
  beforeEach(() => {
    mockedGetStatus.mockReset();
    mockedSetKey.mockReset();
  });

  it('表示時に現在の設定状態を読み込む', async () => {
    mockedGetStatus.mockResolvedValue({ configured: false });
    render(<SettingsPage />);

    expect(await screen.findByText('現在の状態: 未設定')).toBeTruthy();
  });

  it('APIキーを送信すると設定済みに更新される', async () => {
    mockedGetStatus.mockResolvedValue({ configured: false });
    mockedSetKey.mockResolvedValue();

    render(<SettingsPage />);

    const input = await screen.findByLabelText('OpenAI API Key');
    fireEvent.change(input, { target: { value: 'sk-test-abc123456789' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(mockedSetKey).toHaveBeenCalledWith('sk-test-abc123456789');
    });

    expect(await screen.findByText('設定が更新されました')).toBeTruthy();
    expect(await screen.findByText('現在の状態: 設定済み')).toBeTruthy();
  });
});
