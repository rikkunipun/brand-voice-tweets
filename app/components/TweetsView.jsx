'use client';
import { useState } from 'react';
import { Button, Card, Spinner } from './ui.jsx';
import { copyText, shortAngle } from '../lib/api.js';
import { OUTDATED_TEXT } from '@/lib/view-state.js';

const STYLE_CLASSES = {
  engaging: 'bg-blue-50 text-blue-700 ring-blue-200',
  promotional: 'bg-orange-50 text-orange-700 ring-orange-200',
  witty: 'bg-pink-50 text-pink-700 ring-pink-200',
  informative: 'bg-teal-50 text-teal-700 ring-teal-200',
};

const AVATAR_COLORS = ['bg-indigo-600', 'bg-rose-600', 'bg-emerald-600', 'bg-amber-600', 'bg-sky-600', 'bg-fuchsia-600'];

function Tag({ children, className = 'bg-slate-100 text-slate-700 ring-slate-200', title }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${className}`}>
      {children}
    </span>
  );
}

function TweetCard({ tweet, check, displayName, avatarClass, onRegenerate, regenerating, anyBusy }) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [copied, setCopied] = useState(false);
  const length = check?.length ?? tweet.text.length;
  const issues = check?.issues ?? [];

  async function copy() {
    if (await copyText(tweet.text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <article className="rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-label={`Tweet ${tweet.slot}`}>
      <div className="flex gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white ${avatarClass}`} aria-hidden="true">
          {displayName.trim().charAt(0).toUpperCase() || '?'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px]">
            <span className="font-semibold">{displayName}</span>
            <span className="text-muted"> · draft preview</span>
          </p>
          <p className={`mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed ${regenerating ? 'opacity-40' : ''}`}>{tweet.text}</p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Tag className={STYLE_CLASSES[tweet.style]}>{tweet.style}</Tag>
            {tweet.angle && <Tag title={tweet.angle}>{shortAngle(tweet.angle)}</Tag>}
            {tweet.theme && <Tag title="Theme from the Voice Card" className="bg-brand-soft text-brand ring-indigo-200">{tweet.theme}</Tag>}
            {tweet.revised && (
              <button type="button" onClick={() => setShowOriginal((v) => !v)} aria-expanded={showOriginal}
                className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-medium text-yellow-900 ring-1 ring-inset ring-yellow-300 hover:bg-yellow-200">
                Revised by editor {showOriginal ? '▴' : '▾'}
              </button>
            )}
            {tweet.regenerated && <Tag className="bg-slate-100 text-slate-700 ring-slate-300">Regenerated</Tag>}
            <span className={`ml-auto text-xs tabular-nums ${length > 280 ? 'font-semibold text-red-600' : length > 260 ? 'text-amber-600' : 'text-muted'}`}>{length}/280</span>
          </div>

          {tweet.revised && showOriginal && (
            <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm">
              <p><span className="font-medium">Why it was revised:</span> {tweet.revisionReason}</p>
              <p className="mt-1"><span className="font-medium">Original:</span> <span className="text-muted">{tweet.originalText}</span></p>
            </div>
          )}

          {issues.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" aria-label="Check warnings">
              {issues.map((i) => <li key={i.message}>⚠ {i.message}</li>)}
            </ul>
          )}

          {tweet.why && <p className="mt-3 text-xs text-muted">Draws on: {tweet.why}</p>}

          <div className="mt-3 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-3">
            <div className="flex gap-2">
              <Button onClick={copy} className="px-3 py-1.5">{copied ? 'Copied ✓' : 'Copy'}</Button>
              <Button onClick={() => onRegenerate(tweet.slot)} disabled={anyBusy} className="px-3 py-1.5">
                {regenerating ? <><Spinner /> Rewriting…</> : 'Regenerate this tweet'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function TweetsView({ tweets, checks, plan, warnings, summary, brandLabel, displayName, stale, busy, onRebuild, onRegenerateAll, onRegenerate, regeneratingSlot, onBack, onStartOver, sampleNote, regenError }) {
  const [copiedAll, setCopiedAll] = useState(false);
  const avatarClass = AVATAR_COLORS[(brandLabel.length + brandLabel.charCodeAt(0)) % AVATAR_COLORS.length];
  const revised = tweets.filter((t) => t.revised).length;
  const passed = checks.summary.passed;
  const cleanRun = passed === tweets.length;

  async function copyAll() {
    // Plain text: the voice summary, then the tweets.
    const text = [
      `BRAND VOICE: ${displayName}`,
      summary.map((b) => `- ${b}`).join('\n'),
      'TWEETS',
      tweets.map((t, i) => `${i + 1}. ${t.text}`).join('\n\n'),
    ].join('\n\n');
    if (await copyText(text)) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    }
  }

  return (
    <div className="space-y-5">
      {sampleNote}
      {stale && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div>
            <p className="font-medium">{OUTDATED_TEXT[stale]}</p>
            {stale === 'brief' && <p>These tweets were written from the earlier brief. Rebuild the Voice Card, then generate again.</p>}
          </div>
          {stale === 'brief'
            ? <Button variant="primary" onClick={onRebuild} disabled={busy}>Rebuild Voice Card</Button>
            : <Button variant="primary" onClick={onRegenerateAll} disabled={busy}>Regenerate 10 tweets</Button>}
        </div>
      )}
      {warnings.length > 0 && (
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {warnings.map((w) => <p key={w}>{w}</p>)}
        </div>
      )}
      {plan?.wittyReplaced > 0 && (
        <div role="status" className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          Witty slots replaced: your instructions rule out humour.
        </div>
      )}
      <Card title={`Brand voice: ${displayName}`}>
        <ul className="space-y-2">
          {summary.map((b) => (
            <li key={b} className="flex gap-3 text-[15px]">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Your 10 tweets</h2>
            <p className="text-sm text-muted">
              <span className={cleanRun ? 'text-emerald-700' : 'text-amber-700'}>{passed}/{tweets.length} passed the automated checks</span>
              {revised > 0 && <> · {revised} revised by the editor</>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={copyAll}>{copiedAll ? 'Copied all ✓' : 'Copy all'}</Button>
            <Button onClick={onBack}>Back to Voice</Button>
            <Button onClick={onStartOver}>Start over</Button>
          </div>
        </div>
        {regenError && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{regenError}</p>}
      </Card>

      <div className={`space-y-4 ${stale ? 'opacity-60' : ''}`}>
        {tweets.map((t) => (
          <TweetCard
            key={t.slot}
            tweet={t}
            check={checks.perTweet.find((p) => p.slot === t.slot)}
            displayName={brandLabel}
            avatarClass={avatarClass}
            onRegenerate={onRegenerate}
            regenerating={regeneratingSlot === t.slot}
            anyBusy={regeneratingSlot !== null}
          />
        ))}
      </div>
    </div>
  );
}
