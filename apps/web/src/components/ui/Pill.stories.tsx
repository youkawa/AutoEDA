import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pill } from './Pill';

const meta: Meta<typeof Pill> = {
  title: 'Foundations/Pill',
  component: Pill,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<typeof Pill>;

export const Variants: Story = {
  name: 'variants',
  render: () => (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Pill tone="red">critical</Pill>
        <Pill tone="amber">warning</Pill>
        <Pill tone="emerald">ok</Pill>
        <Pill tone="brand">brand</Pill>
        <Pill tone="slate">neutral</Pill>
      </div>
    </div>
  ),
};

