import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatCard } from './StatCard';
import { Table2, Activity, Percent } from 'lucide-react';

const meta: Meta<typeof StatCard> = {
  title: 'Foundations/StatCard',
  component: StatCard,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<typeof StatCard>;

export const KPI: Story = {
  name: 'kpi',
  render: () => (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={Table2} label="行数" value={(123456).toLocaleString()} sub="Rows" />
        <StatCard icon={Activity} label="列数" value={(48).toLocaleString()} sub="Columns" />
        <StatCard icon={Percent} label="欠損率" value={`12.3%`} sub="Missing" />
      </div>
    </div>
  ),
};

