import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './Card';
import { Button } from '@autoeda/ui-kit';

const meta: Meta<typeof Card> = {
  title: 'Foundations/Card',
  component: Card,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    padding: 'md',
  },
};

export default meta;

type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: (args) => (
    <div className="min-h-screen bg-slate-50 p-6">
      <Card {...args}>
        <CardHeader>
          <CardTitle>カードタイトル</CardTitle>
          <CardDescription>説明テキストをここに配置します。</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-slate-700">任意のコンテンツを配置できます。グリッドやフォーム、チャートなど。</p>
        </CardContent>
        <CardFooter>
          <Button variant="primary">保存</Button>
          <Button variant="secondary">キャンセル</Button>
        </CardFooter>
      </Card>
    </div>
  ),
};

export const NoPadding: Story = {
  args: { padding: 'none' },
  render: (args) => (
    <div className="min-h-screen bg-slate-50 p-6">
      <Card {...args}>
        <img alt="hero" src="https://via.placeholder.com/960x320" className="w-full rounded-xl" />
      </Card>
    </div>
  ),
};

export const Dense: Story = {
  args: { padding: 'sm' },
  render: (args) => (
    <div className="min-h-screen bg-slate-50 p-6">
      <Card {...args}>
        <CardHeader>
          <CardTitle>コンパクトカード</CardTitle>
          <CardDescription>テーブルなど密度の高い要素に適します。</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 text-sm text-slate-700">
            <li>項目A</li>
            <li>項目B</li>
            <li>項目C</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  ),
};

