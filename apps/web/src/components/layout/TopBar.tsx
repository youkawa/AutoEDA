import React from 'react';
import { BarChart3, HelpCircle, Settings, Info, Search } from 'lucide-react';
import { Button } from '@autoeda/ui-kit';

interface TopBarProps {
  pageTitle: string;
  datasetName?: string;
  onOpenHelp?: () => void;
  onOpenSettings?: () => void;
}

export function TopBar({ pageTitle, datasetName, onOpenHelp, onOpenSettings }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="flex items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex flex-1 items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
              <BarChart3 className="h-6 w-6" />
            </span>
            <div className="space-y-0.5">
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">AutoEDA Suite</p>
              <p className="text-base font-semibold text-slate-900">{pageTitle}</p>
            </div>
          </div>
          {datasetName ? (
            <div className="hidden items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 md:inline-flex">
              <Info className="mr-2 h-4 w-4 text-brand-500" />
              <span className="font-semibold text-slate-700">{datasetName}</span>
              <span className="ml-2 text-slate-400">分析対象データセット</span>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <div className="relative hidden md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="コマンド / データセット検索"
              className="w-64 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-600 shadow-sm transition focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onOpenHelp}
            className="hidden sm:inline-flex"
            icon={<HelpCircle className="h-4 w-4" />}
          >
            ヘルプ
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenSettings}
            icon={<Settings className="h-4 w-4" />}
          >
            設定
          </Button>
        </div>
      </div>
    </header>
  );
}
