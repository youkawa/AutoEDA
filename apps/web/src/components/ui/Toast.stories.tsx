import type { Meta, StoryObj } from '@storybook/react-vite';
import { Toast } from '@autoeda/ui-kit';

const meta: Meta<typeof Toast> = {
  title: 'Foundations/Toast',
  component: Toast,
  parameters: { layout: 'fullscreen' },
  args: { autoClose: 0 },
};

export default meta;

type Story = StoryObj<typeof Toast>;

export const Static: Story = {
  name: 'static',
  render: (args) => (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        <Toast {...args} message="情報のトーストです" tone="info" />
        <Toast {...args} message="成功しました" tone="success" />
        <Toast {...args} message="警告があります" tone="warning" />
        <Toast {...args} message="エラーが発生しました" tone="error" />
      </div>
    </div>
  ),
};

