import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

type Crumb = { label: string; to?: string };

function makeCrumbs(pathname: string): Crumb[] {
  const parts = pathname.split('/').filter(Boolean);
  const root: Crumb = { label: 'ダッシュボード', to: '/' };
  if (parts.length === 0) return [root];
  const [head, tail] = [parts[0], parts.slice(1)];
  const map: Record<string, string> = {
    datasets: 'データセット',
    eda: 'EDA概要',
    charts: 'チャート提案',
    qna: 'Q&A',
    actions: '次アクション',
    pii: 'PII検出',
    leakage: 'リーク検査',
    recipes: 'レシピ出力',
    settings: '設定',
  };
  const first: Crumb = head in map ? { label: map[head], to: `/${head}` } : { label: head };
  // datasetId を含むルートは /<name>/<id>
  if (tail.length >= 1 && head !== 'datasets' && head !== 'settings') {
    return [root, first, { label: tail[0] }];
  }
  return [root, first];
}

export function Breadcrumbs() {
  const location = useLocation();
  const items = makeCrumbs(location.pathname);
  return (
    <nav aria-label="breadcrumb" className="mb-3 text-sm text-slate-600">
      <ol className="flex items-center gap-2">
        {items.map((c, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={`${c.label}-${idx}`} className="flex items-center gap-2">
              {c.to && !isLast ? (
                <Link to={c.to} className="text-slate-600 hover:text-slate-900 underline decoration-dotted underline-offset-2">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={isLast ? 'page' : undefined} className={isLast ? 'text-slate-900 font-medium' : ''}>
                  {c.label}
                </span>
              )}
              {!isLast && <ChevronRight className="h-4 w-4 text-slate-400" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

