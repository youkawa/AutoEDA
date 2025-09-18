import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '@autoeda/ui-kit';
import { AlertTriangle, Settings } from 'lucide-react';

const meta: Meta<typeof Button> = {
  title: 'Foundations/Button',
  component: Button,
  argTypes: {
    onClick: { action: 'clicked' },
  },
  args: {
    children: 'ボタン',
  },
  parameters: { layout: 'centered' },
};

export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { variant: 'primary' } };
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Ghost: Story = { args: { variant: 'ghost' } };
export const Danger: Story = { args: { variant: 'danger' } };

export const WithIcon: Story = {
  args: { variant: 'secondary', icon: <Settings size={16} /> },
};

export const Loading: Story = {
  args: { variant: 'primary', loading: true, children: '処理中…' },
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex gap-4">
      <Button {...args} size="sm">小</Button>
      <Button {...args} size="md">中</Button>
      <Button {...args} size="lg">大</Button>
    </div>
  ),
};

export const DangerWithIcon: Story = {
  args: { variant: 'danger', icon: <AlertTriangle size={16} /> },
};

