'use client';
import { useState } from 'react';
import { AutoTextarea, Button, Card, Section, Spinner } from './ui.jsx';
import { EvidenceChip, EvidenceLegend } from './EvidenceChip.jsx';
import { cleanUrl } from '../lib/api.js';
import { conflictSummary } from '@/lib/view-state.js';

const input = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand';
const MAX_TRAITS = 6;

// One line per item. The text lives in local state so typing a trailing newline isn't swallowed;
// the parent remounts this (via key) when a new card loads.
function LinesField({ id, label, hint, value, onChange }) {
  const [text, setText] = useState(value.join('\n'));
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <AutoTextarea
        id={id}
        minRows={3}
        className={input}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.split('\n').map((l) => l.trim()).filter(Boolean));
        }}
      />
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}

function ResearchStatus({ research }) {
  if (!research) return null;
  const { status, reason, sources = [], cached } = research;
  const message =
    status === 'found'
      ? `Found ${sources.length} source${sources.length === 1 ? '' : 's'}${cached ? ' (saved from an earlier lookup)' : ''}.`
      : status === 'skipped'
        ? `No web research: ${reason}. The card uses only what you entered.`
        : `Web research didn't complete (${reason || 'unknown reason'}). The card uses only what you entered.`;
  return (
    <div>
      <p className="text-sm text-muted">{message}</p>
      {sources.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {sources.map((s) => (
            <li key={s.url} className="truncate">
              <a href={cleanUrl(s.url)} target="_blank" rel="noopener noreferrer" className="text-brand underline underline-offset-2 hover:text-brand-dark">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function researchMeta(research) {
  if (!research) return '';
  if (research.status === 'found') return `${research.sources.length} sources`;
  return research.status === 'skipped' ? 'skipped' : 'did not complete';
}

// Conflicts are a one-line yellow notice that expands to the details.
function ConflictNotice({ conflicts }) {
  return (
    <details className="group rounded-xl border border-yellow-300 bg-yellow-50 text-sm text-yellow-900">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-700 [&::-webkit-details-marker]:hidden">
        <span className="font-medium">
          {conflictSummary(conflicts)}
        </span>
        <span className="shrink-0 text-xs underline underline-offset-2">
          <span className="group-open:hidden">Show details</span>
          <span className="hidden group-open:inline">Hide details</span>
        </span>
      </summary>
      <ul className="space-y-3 border-t border-yellow-200 px-4 py-3">
        {conflicts.map((c) => (
          <li key={c.issue}>
            <p className="font-medium">{c.issue}</p>
            <p><span className="font-medium">You said:</span> {c.user_says}</p>
            <p><span className="font-medium">Other signal:</span> {c.signal_says}</p>
            <p><span className="font-medium">What we did:</span> {c.resolution}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function VoiceCardView({ card, setCard, research, cardWarnings, builtHumour, toneChanged, basis, onGenerate, onRebuild, outdated, onBack, busy, rebuilding, sampleNote }) {
  const update = (patch) => setCard({ ...card, ...patch });
  const updateRules = (patch) => setCard({ ...card, style_rules: { ...card.style_rules, ...patch } });
  const setTone = (i, patch) =>
    update({ tone: card.tone.map((t, j) => (j === i ? { ...t, ...patch, evidence: 'user-defined' } : t)) });

  const notes = [...card.assumptions, ...cardWarnings];

  return (
    <div className="space-y-5">
      {sampleNote}

      {outdated && (
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Outdated: your brief changed</p>
          <p>This Voice Card was built from the earlier brief. Rebuild it to match your changes; any edits you made to the card will be replaced.</p>
        </div>
      )}

      <Card title={`Voice Card: ${card.brand_display_name}`} aside={<span className="text-xs text-muted">Editable, one bullet per line</span>}>
        <LinesField id="summary" label="Voice summary" hint="Tweets are written from this card, so an edit applies the next time you generate." value={card.voice_summary} onChange={(voice_summary) => update({ voice_summary })} />
        {toneChanged && <p role="status" className="mt-2 text-sm text-amber-800">Tone changed. Check the summary still matches.</p>}
        <p className="mt-2 text-xs text-muted">{basis}</p>
      </Card>

      {card.conflicts.length > 0 && <ConflictNotice conflicts={card.conflicts} />}

      <Card title="How we know" aside={<span className="text-xs text-muted">Every trait is labelled with where it came from</span>}>
        <EvidenceLegend />
      </Card>

      <Card title="Tone" aside={<span className="text-xs text-muted">Editable. Anything you change becomes user-defined.</span>}>
        <ul className="space-y-3">
          {card.tone.map((t, i) => (
            <li key={i} className="rounded-xl border border-line p-3">
              <div className="mb-2 flex items-start gap-2">
                <AutoTextarea aria-label={`Tone trait ${i + 1}`} minRows={1} className={`${input} font-medium`} value={t.trait} maxLength={80} onChange={(e) => setTone(i, { trait: e.target.value.replace(/\n/g, ' ') })} />
                <span className="pt-1.5"><EvidenceChip evidence={t.evidence} /></span>
                <button type="button" aria-label={`Remove tone trait ${i + 1}`} onClick={() => update({ tone: card.tone.filter((_, j) => j !== i) })} className="rounded-md px-2 py-1 text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-red-600">×</button>
              </div>
              <AutoTextarea aria-label={`Detail for tone trait ${i + 1}`} minRows={2} className={input} value={t.detail} maxLength={400} onChange={(e) => setTone(i, { detail: e.target.value })} />
            </li>
          ))}
        </ul>
        {card.tone.length < MAX_TRAITS && (
          <Button variant="ghost" className="mt-2" onClick={() => update({ tone: [...card.tone, { trait: '', detail: '', evidence: 'user-defined' }] })}>
            + Add a trait
          </Button>
        )}
      </Card>

      <Card title="Brand hooks" aside={<span className="text-xs text-muted">Things only this brand can say</span>}>
        <ul className="space-y-3">
          {card.brand_hooks.map((h) => (
            <li key={h.hook} className="flex items-start justify-between gap-2 text-sm"><span>{h.hook}</span><EvidenceChip evidence={h.evidence} /></li>
          ))}
        </ul>
      </Card>

      <Section title="Themes" defaultOpen meta="Each tweet is built around one">
        <ul className="space-y-3">
          {card.content_themes.map((t) => (
            <li key={t.theme} className="text-sm">
              <div className="flex items-start justify-between gap-2"><span className="font-medium">{t.theme}</span><EvidenceChip evidence={t.evidence} /></div>
              <p className="text-muted">{t.detail}</p>
            </li>
          ))}
        </ul>
      </Section>

      {card.voice_examples.length > 0 && (
        <Section title="Real lines the voice is learned from" defaultOpen meta="Copied word for word, never written by us">
          <ul className="space-y-2">
            {card.voice_examples.map((v) => (
              <li key={v.text} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                “{v.text}”
                <span className="ml-2 text-xs text-muted">{v.source === 'pasted-post' ? 'from your pasted posts' : 'found online'}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Audience and style rules" meta="Emoji, hashtags and humour are editable">
        <div className="flex items-start gap-2 text-sm">
          <span className="font-medium">Audience:</span>
          <span className="flex-1">{card.target_audience.description}</span>
          <EvidenceChip evidence={card.target_audience.evidence} />
        </div>
        <dl className="mt-4 space-y-3 text-sm">
          <div><dt className="font-medium">Language</dt><dd className="text-muted">{card.style_rules.language}</dd></div>
          <div><dt className="font-medium">Sentence style</dt><dd className="text-muted">{card.style_rules.sentence_style}</dd></div>
          {card.style_rules.signature_patterns.length > 0 && (
            <div>
              <dt className="font-medium">Signature patterns</dt>
              <dd><ul className="list-disc space-y-1 pl-5 text-muted">{card.style_rules.signature_patterns.map((p) => <li key={p}>{p}</li>)}</ul></dd>
            </div>
          )}
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={card.humour_allowed !== false}
              onChange={(e) => update({ humour_allowed: e.target.checked })} />
            Humour allowed
          </label>
          {(card.humour_allowed !== false) !== builtHumour && <EvidenceChip evidence="user-defined" />}
          <span className="text-xs text-muted">Off replaces the witty slots with engaging and informative ones.</span>
        </div>
        <div className="mt-4 grid max-w-md grid-cols-2 gap-3">
          <div>
            <label htmlFor="emoji" className="mb-1 block text-sm font-medium">Emoji</label>
            <select id="emoji" className={input} value={card.style_rules.emoji_use} onChange={(e) => updateRules({ emoji_use: e.target.value })}>
              <option value="none">none</option><option value="light">light (up to 2)</option><option value="heavy">heavy (up to 6)</option>
            </select>
          </div>
          <div>
            <label htmlFor="hashtags" className="mb-1 block text-sm font-medium">Hashtags</label>
            <select id="hashtags" className={input} value={card.style_rules.hashtag_use} onChange={(e) => updateRules({ hashtag_use: e.target.value })}>
              <option value="none">none</option><option value="light">light (up to 1)</option><option value="moderate">moderate (up to 3)</option>
            </select>
          </div>
        </div>
      </Section>

      <Section title="Do and don't" meta="Editable, one item per line">
        <div className="grid gap-5 lg:grid-cols-3">
          <LinesField id="dos" label="Do" hint="Tweets follow these." value={card.dos} onChange={(dos) => update({ dos })} />
          <LinesField id="donts" label="Don't" hint="Tweets avoid these." value={card.donts} onChange={(donts) => update({ donts })} />
          <LinesField id="avoid" label="Words to avoid" hint="Checked automatically in every tweet." value={card.avoid_words} onChange={(avoid_words) => update({ avoid_words })} />
        </div>
      </Section>

      {notes.length > 0 && (
        <Section title="Check these" meta={`${notes.length} gap${notes.length === 1 ? '' : 's'} filled with judgement`}>
          <p className="mb-2 text-sm text-muted">Fix anything that's wrong in the fields above.</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </Section>
      )}

      <Section title="Research" meta={researchMeta(research)}>
        <ResearchStatus research={research} />
      </Section>

      {/* Sticky: stays at the bottom of the screen while the card scrolls, then settles after the last section. */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          {outdated ? (
            <Button variant="primary" className="px-5 py-2.5" onClick={onRebuild} disabled={rebuilding}>
              {rebuilding ? <><Spinner /> Working…</> : 'Rebuild Voice Card'}
            </Button>
          ) : (
            <Button variant="primary" className="px-5 py-2.5" onClick={onGenerate} disabled={busy || card.voice_summary.length === 0}>
              {busy ? <><Spinner /> Working…</> : 'Generate 10 tweets'}
            </Button>
          )}
          <Button onClick={onBack} disabled={busy || rebuilding}>Back to Details</Button>
        </div>
      </div>
    </div>
  );
}
