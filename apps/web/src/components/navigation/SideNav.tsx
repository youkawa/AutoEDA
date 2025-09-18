import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

export type SideNavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  disabled?: boolean;
  description?: string;
  match?: (pathname: string) => boolean;
};

interface SideNavProps {
  items: SideNavItem[];
}

export function SideNav({ items }: SideNavProps) {
  const location = useLocation();

  return (
    <aside className="hidden w-64 flex-shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
      <div className="px-6 pt-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">ナビゲーション</p>
      </div>
      <nav className="flex-1 overflow-y-auto px-4 py-6">
        <ul className="space-y-2">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.match
              ? item.match(location.pathname)
              : location.pathname === item.to;

            if (item.disabled) {
              return (
                <li key={item.label}>
                  <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="flex flex-col">
                      <span className="font-medium">{item.label}</span>
                      {item.description && (
                        <span className="text-xs text-slate-400">{item.description}</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            }

            return (
              <li key={item.label}>
                <Link
                  to={item.to}
                  className={`
                    group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all
                    ${isActive
                      ? 'bg-brand-50 text-brand-700 shadow-sm border-l-4 border-brand-600'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
                  `}
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all
                      ${isActive ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700'}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
