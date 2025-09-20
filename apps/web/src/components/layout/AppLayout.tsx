import React, { useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Database,
  BarChart3,
  Images,
  MessageSquare,
  ClipboardCheck,
  ShieldCheck,
  AlertTriangle,
  FileCode,
  Settings,
} from 'lucide-react';
import { SideNav, type SideNavItem } from '../navigation/SideNav';
import { TopBar } from './TopBar';
import { Button } from '@autoeda/ui-kit';
import { useLastDataset } from '../../contexts/LastDatasetContext';
import { Breadcrumbs } from '../navigation/Breadcrumbs';

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { lastDataset } = useLastDataset();

  const datasetId = lastDataset?.id;
  const datasetName = lastDataset?.name;

  const navItems: SideNavItem[] = useMemo(() => {
    const base: SideNavItem[] = [
      {
        label: 'ダッシュボード',
        to: '/',
        icon: LayoutDashboard,
        match: (pathname) => pathname === '/',
      },
      {
        label: 'データセット',
        to: '/datasets',
        icon: Database,
        match: (pathname) => pathname.startsWith('/datasets'),
      },
    ];

    const datasetDependent: SideNavItem[] = datasetId
      ? [
          {
            label: 'EDA概要',
            to: `/eda/${datasetId}`,
            icon: BarChart3,
            match: (pathname) => pathname.startsWith('/eda/'),
          },
          {
            label: 'チャート提案',
            to: `/charts/${datasetId}`,
            icon: Images,
            match: (pathname) => pathname.startsWith('/charts/'),
          },
          {
            label: 'Q&A',
            to: `/qna/${datasetId}`,
            icon: MessageSquare,
            match: (pathname) => pathname.startsWith('/qna/'),
          },
          {
            label: '計画',
            to: `/plan/${datasetId}`,
            icon: FileCode,
            match: (pathname) => pathname.startsWith('/plan/'),
          },
          {
            label: '分析開発',
            to: `/analysis/${datasetId}`,
            icon: FileCode,
            match: (pathname) => pathname.startsWith('/analysis/'),
          },
          {
            label: '次アクション',
            to: `/actions/${datasetId}`,
            icon: ClipboardCheck,
            match: (pathname) => pathname.startsWith('/actions/'),
          },
          {
            label: 'PII検出',
            to: `/pii/${datasetId}`,
            icon: ShieldCheck,
            match: (pathname) => pathname.startsWith('/pii/'),
          },
          {
            label: 'リーク検査',
            to: `/leakage/${datasetId}`,
            icon: AlertTriangle,
            match: (pathname) => pathname.startsWith('/leakage/'),
          },
          {
            label: 'レシピ出力',
            to: `/recipes/${datasetId}`,
            icon: FileCode,
            match: (pathname) => pathname.startsWith('/recipes/'),
          },
        ]
      : [
          {
            label: 'EDA概要',
            to: '#',
            icon: BarChart3,
            disabled: true,
            description: 'データセットを選択してください',
          },
          {
            label: 'チャート提案',
            to: '#',
            icon: Images,
            disabled: true,
            description: 'データセットを選択してください',
          },
          {
            label: 'Q&A',
            to: '#',
            icon: MessageSquare,
            disabled: true,
            description: 'データセットを選択してください',
          },
          {
            label: '計画',
            to: '#',
            icon: FileCode,
            disabled: true,
            description: 'データセットを選択してください',
          },
          {
            label: '分析開発',
            to: '#',
            icon: FileCode,
            disabled: true,
            description: 'データセットを選択してください',
          },
          {
            label: '次アクション',
            to: '#',
            icon: ClipboardCheck,
            disabled: true,
            description: 'データセットを選択してください',
          },
          {
            label: 'PII検出',
            to: '#',
            icon: ShieldCheck,
            disabled: true,
            description: 'データセットを選択してください',
          },
          {
            label: 'リーク検査',
            to: '#',
            icon: AlertTriangle,
            disabled: true,
            description: 'データセットを選択してください',
          },
          {
            label: 'レシピ出力',
            to: '#',
            icon: FileCode,
            disabled: true,
            description: 'データセットを選択してください',
          },
        ];

    return [
      ...base,
      ...datasetDependent,
      {
        label: '設定',
        to: '/settings',
        icon: Settings,
        match: (pathname) => pathname.startsWith('/settings'),
      },
    ];
  }, [datasetId]);

  const activeItem = navItems.find((item) => {
    if (item.disabled) return false;
    if (item.match) return item.match(location.pathname);
    return location.pathname === item.to;
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        <SideNav items={navItems} />
        <div className="flex flex-1 flex-col">
          <TopBar
            pageTitle={activeItem?.label ?? 'ダッシュボード'}
            datasetName={datasetName}
            onOpenHelp={() => navigate('/datasets')}
            onOpenSettings={() => navigate('/settings')}
          />

          <div className="border-b border-slate-200 bg-white lg:hidden">
            <div className="flex gap-2 overflow-x-auto px-4 py-3">
              {navItems.map((item) => (
                <Button
                  key={item.label}
                  size="sm"
                  variant={location.pathname === item.to || (item.match && item.match(location.pathname)) ? 'primary' : 'secondary'}
                  onClick={() => {
                    if (!item.disabled) {
                      navigate(item.to);
                    }
                  }}
                  disabled={item.disabled}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-6xl">
              <Breadcrumbs />
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
