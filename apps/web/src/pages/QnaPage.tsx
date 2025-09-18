import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { askQnA } from '@autoeda/client-sdk';
import type { Answer } from '@autoeda/schemas';
import { Button } from '@autoeda/ui-kit';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/Card';
import { useLastDataset } from '../contexts/LastDatasetContext';
import { Sparkles, MessageCircle, Loader2, Quote } from 'lucide-react';

const QUESTION_SUGGESTIONS = [
  '売上に最も効いている要因は？',
  '季節性の影響を可視化するには？',
  'リークリスクの高い特徴量はありますか？',
];

export function QnaPage() {
  const { datasetId } = useParams();
  const { setLastDataset } = useLastDataset();
  const [question, setQuestion] = useState('売上のトレンドは？');
  const [answers, setAnswers] = useState<Answer[] | null>(null);
  const [loading, setLoading] = useState(false);

  const references = useMemo(() => {
    if (!answers) return [];
    const items = answers.flatMap((answer) => answer.references ?? []);
    const seen = new Set<string>();
    return items.filter((ref) => {
      const key = `${ref.kind}:${ref.locator}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [answers]);

  async function handleAsk(customQuestion?: string) {
    if (!datasetId) return;
    const q = customQuestion ?? question;
    if (!q.trim()) return;
    setLoading(true);
    setLastDataset({ id: datasetId });
    const res = await askQnA(datasetId, q);
    setAnswers(res);
    setQuestion(q);
    setLoading(false);
  }

  const primaryAnswer = answers?.[0];
  const coverage = Math.round((primaryAnswer?.coverage ?? 0) * 100);

  return (
    <div className="space-y-6">
      <Card padding="lg" className="space-y-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-lg">
            <MessageCircle className="h-5 w-5 text-brand-600" />
            根拠付き Q&A
          </CardTitle>
          <CardDescription>
            数値はツール出力を参照し、RAG により引用を明示した回答を生成します。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="flex-1">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-400">
                質問内容
              </label>
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={3}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                placeholder="売上に効いている要因は？"
              />
            </div>
            <div className="flex w-full max-w-xs flex-col gap-2">
              <Button
                variant="primary"
                size="lg"
                loading={loading}
                onClick={() => handleAsk()}
                icon={<Sparkles className="h-4 w-4" />}
              >
                分析を実行
              </Button>
              <p className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                LLM が未設定の場合は、ツールの要約結果のみが返ります。
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {QUESTION_SUGGESTIONS.map((suggestion) => (
              <Button
                key={suggestion}
                variant="secondary"
                size="sm"
                onClick={() => handleAsk(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card padding="lg">
          <div className="flex items-center justify-center gap-3 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            分析中...
          </div>
        </Card>
      ) : primaryAnswer ? (
        <Card padding="lg" className="space-y-4">
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-3 text-lg">
                <Quote className="h-5 w-5 text-brand-600" />
                回答
              </CardTitle>
              <CardDescription>引用被覆率 {coverage}%・ツール出力に基づく回答です。</CardDescription>
            </div>
            <span
              className={`rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-widest ${
                coverage >= 80 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              Coverage {coverage}%
            </span>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
              <div dangerouslySetInnerHTML={{ __html: primaryAnswer.text.replace(/\n/g, '<br />') }} />
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">引用</p>
              {references.length === 0 ? (
                <p className="text-sm text-slate-500">引用はまだありません。</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {references.map((ref, index) => (
                    <span
                      key={`${ref.locator}-${index}`}
                      className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs text-slate-600"
                    >
                      {ref.kind}: {ref.locator}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-3">
            <Button variant="secondary" size="sm" onClick={() => handleAsk('今後 4 週間の売上予測は？')}>
              追質問を行う
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleAsk('特徴量重要度のトップ5は？')}>
              特徴量重要度を確認
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Card padding="lg" className="text-sm text-slate-600">
          <CardHeader>
            <CardTitle>質問を入力してください</CardTitle>
            <CardDescription>
              ドメイン知識・統計指標・品質課題など、知りたいことを自然文で尋ねることができます。
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
