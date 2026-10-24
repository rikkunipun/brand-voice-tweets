'use client';
import { useEffect, useRef, useState } from 'react';
import examples from '@/scripts/test-brands.json';
import BrandForm from './components/BrandForm.jsx';
import VoiceCardView from './components/VoiceCardView.jsx';
import TweetsView from './components/TweetsView.jsx';
import HowItWorks from './components/HowItWorks.jsx';
import { Button, Notice, ProgressPanel } from './components/ui.jsx';
import { postJson, streamPost } from './lib/api.js';
import { APPROACH_DOC_URL, REPO_URL } from './site.js';
import { snapshotInputs, cleanCard, staleness, tweetsDisplay, evidenceBasis, toneKey, toneChanged } from '@/lib/view-state.js';
import { browserStorage, clearSession, loadSession, saveSession } from './lib/session.js';

const EMPTY_INPUTS = { brandName: '', industry: '', objective: 'Engagement', products: '', toneWords: '', pastPosts: '', instructions: '', research: true, website: '', audience: '', maxLength: '' };
const EXAMPLES = { zomato: examples['zomato-posts'], millet: examples.millet };
const STEP_NAMES = ['Details', 'Voice', 'Tweets'];

const ANALYZE_STEPS = {
  research: { key: 'research', label: "Researching the brand's own posts online", hint: 'Web search can take up to a minute.' },
  saved: { key: 'research', label: 'Using saved research for this brand' },
  analysis: { key: 'analysis', label: 'Building the Voice Card' },
};
const GENERATE_STEPS = [
  { key: 'writing', label: 'Writing 10 tweets, one per slot' },
  { key: 'checking', label: 'Running automated checks' },
  { key: 'editing', label: 'Editor is rewriting weak tweets' },
];

// A link once its URL is set in app/site.js; until then plain text, so the page never shows a dead link.
function FooterLink({ href, children }) {
  if (!href) return <span title="Link coming soon">{children} (coming soon)</span>;
  return <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink">{children}</a>;
}

function StepIndicator({ step, reachable, onGo, outdated = {} }) {
  return (
    <nav aria-label="Progress" className="mb-6">
      <ol className="flex items-center gap-2 sm:gap-3">
        {STEP_NAMES.map((name, i) => {
          const n = i + 1;
          const active = step === n;
          const ok = reachable(n);
          return (
            <li key={name} className="flex min-w-0 flex-1 items-center gap-2">
              <button type="button" disabled={!ok} onClick={() => onGo(n)} aria-current={active ? 'step' : undefined}
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default ${active ? 'border-brand bg-brand-soft' : ok ? 'border-line bg-surface hover:bg-slate-50' : 'border-line bg-surface opacity-60'}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${active ? 'bg-brand text-white' : ok ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {ok && !active ? '✓' : n}
                </span>
                <span className={`truncate font-medium ${active ? 'text-brand' : ''}`}>{name}{outdated[n] && <span className="font-normal text-amber-700"> · outdated</span>}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function Home() {
  const [step, setStep] = useState(1);
  const [inputs, setInputs] = useState(EMPTY_INPUTS);
  const [card, setCard] = useState(null);
  const [cardVersion, setCardVersion] = useState(0);
  const [builtHumour, setBuiltHumour] = useState(true); // humour_allowed as the model set it; a different value means the user changed it
  const [research, setResearch] = useState(null);
  const [cardSnap, setCardSnap] = useState(null); // { inputs }: the brief the current card was built from
  const [tweetSnap, setTweetSnap] = useState(null); // { inputs, card }: what the current tweets were written from
  const [cardWarnings, setCardWarnings] = useState([]);
  const [tweetResult, setTweetResult] = useState(null);
  const [busy, setBusy] = useState(null); // 'analyze' | 'generate' | null
  const [seen, setSeen] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [regenError, setRegenError] = useState('');
  const [regeneratingSlot, setRegeneratingSlot] = useState(null);
  const [sample, setSample] = useState('');
  const top = useRef(null);
  const restored = useRef(false); // saving waits until the saved session has been read, or it would be overwritten

  // Restore the work after a refresh (sessionStorage; silently skipped if unavailable).
  useEffect(() => {
    const s = browserStorage() && loadSession(browserStorage());
    if (s) {
      setInputs({ ...EMPTY_INPUTS, ...s.inputs });
      if (s.card) {
        setCard(s.card);
        setCardVersion((v) => v + 1);
        setResearch(s.research || null);
        setCardWarnings(s.cardWarnings || []);
        setCardSnap(s.cardSnap || null);
        setBuiltHumour(s.builtHumour !== false);
      }
      if (s.tweetResult && s.tweetSnap) {
        setTweetResult({ warnings: [], ...s.tweetResult });
        setTweetSnap(s.tweetSnap);
      }
      setSample(s.sample || '');
      setStep(s.card ? (s.step === 3 && s.tweetResult && s.tweetSnap ? 3 : s.step === 2 ? 2 : 1) : 1);
    }
    restored.current = true;
  }, []);

  useEffect(() => {
    if (!restored.current || !browserStorage()) return;
    saveSession(browserStorage(), { step, inputs, card, research, cardWarnings, cardSnap, builtHumour, tweetResult, tweetSnap, sample });
  }, [step, inputs, card, research, cardWarnings, cardSnap, builtHumour, tweetResult, tweetSnap, sample]);

  useEffect(() => {
    if (!busy) return undefined;
    setElapsed(0);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [busy]);

  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start' });
  }, [step]);

  const reachable = (n) => n === 1 || (n === 2 && Boolean(card)) || (n === 3 && Boolean(tweetResult));

  function pickExample(key) {
    setInputs({ ...EMPTY_INPUTS, ...EXAMPLES[key] });
    setError('');
  }

  async function loadSample(name) {
    setError('');
    try {
      const res = await fetch(`/samples/${name}.json`);
      if (!res.ok) throw new Error();
      const s = await res.json();
      setInputs({ ...EMPTY_INPUTS, ...s.inputs });
      setCardSnap({ inputs: snapshotInputs(s.inputs), tone: toneKey(s.card) });
      setBuiltHumour(s.card.humour_allowed !== false);
      setTweetSnap({ inputs: snapshotInputs(s.inputs), card: cleanCard(s.card), research: s.research });
      setCard(s.card);
      setCardVersion((v) => v + 1);
      setResearch(s.research);
      setCardWarnings(s.cardWarnings || []);
      setTweetResult({ plan: s.plan, tweets: s.tweets, checks: s.checks, warnings: [] });
      setSample(name);
      setStep(3);
    } catch {
      setError("Couldn't load the sample. Please try again.");
    }
  }

  async function analyze() {
    setError('');
    setSeen([]);
    setSample('');
    setBusy('analyze');
    try {
      const sent = snapshotInputs(inputs);
      const result = await streamPost('/api/analyze', { inputs: sent }, (ev) => {
        if (ev.type === 'progress') setSeen((s) => [...s, ev.step === 'research' ? 'research' : ev.cached ? 'saved' : ev.step]);
      });
      setCardSnap({ inputs: sent, tone: toneKey(result.card) });
      setBuiltHumour(result.card.humour_allowed !== false);
      setCard(result.card);
      setCardVersion((v) => v + 1);
      setResearch(result.research);
      setCardWarnings(result.cardWarnings || []);
      setTweetResult(null);
      setTweetSnap(null);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    if (!cardSnap || stale.cardOutdated) return;
    setError('');
    setSeen([]);
    setBusy('generate');
    // Tweets are written from the brief the card was built from (the same as the form while the card is current).
    const used = cardSnap.inputs;
    const cleaned = cleanCard(card);
    try {
      const result = await streamPost('/api/generate', { inputs: used, card: cleaned }, (ev) => {
        if (ev.type === 'progress') setSeen((s) => [...s, ev.step]);
      });
      setCard(cleaned);
      setTweetSnap({ inputs: used, card: cleaned, research });
      setTweetResult({ plan: result.plan, tweets: result.tweets, checks: result.checks, warnings: result.warnings || [] });
      setRegenError('');
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function regenerate(slot) {
    setRegenError('');
    setRegeneratingSlot(slot);
    try {
      const { tweet, checks } = await postJson('/api/regenerate', { inputs: tweetSnap.inputs, card: tweetSnap.card, slot, tweets: tweetResult.tweets });
      setTweetResult((r) => ({ ...r, tweets: r.tweets.map((t) => (t.slot === slot ? tweet : t)), checks }));
    } catch (err) {
      setRegenError(err.message);
    } finally {
      setRegeneratingSlot(null);
    }
  }

  function startOver() {
    setStep(1);
    setCard(null);
    setResearch(null);
    setTweetResult(null);
    setCardSnap(null);
    setTweetSnap(null);
    setSample('');
    setError('');
    setInputs(EMPTY_INPUTS);
    if (browserStorage()) clearSession(browserStorage());
  }

  const stale = staleness({ inputs, card, cardSnap, tweetSnap });
  const analyzeSteps = inputs.brandName.trim() && inputs.research
    ? [seen.includes('saved') ? ANALYZE_STEPS.saved : ANALYZE_STEPS.research, ANALYZE_STEPS.analysis]
    : [ANALYZE_STEPS.analysis];
  const progress = busy === 'analyze'
    ? { steps: analyzeSteps, current: seen.length ? (seen.at(-1) === 'saved' ? 'analysis' : seen.at(-1)) : analyzeSteps[0].key }
    : { steps: GENERATE_STEPS, current: seen.at(-1) || 'writing' };

  const sampleNote = sample ? (
    <Notice tone="info" title="You're viewing a saved sample">
      <p>This result was generated earlier, so it cost nothing to load. Edit the Voice Card or regenerate a tweet to try the live tool, or{' '}
        <button type="button" onClick={startOver} className="font-medium underline underline-offset-2">start with your own brand</button>.</p>
    </Notice>
  ) : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12" ref={top}>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Brand Voice Tweets</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Tell us about a brand. We build a Voice Card that shows where every trait comes from, then write 10 on-brand tweets. Edit the Voice Card, regenerate and copy tweets.
        </p>
      </header>

      <StepIndicator step={step} reachable={reachable} onGo={(n) => !busy && setStep(n)} outdated={{ 2: stale.cardOutdated, 3: Boolean(stale.tweets) }} />

      <div className="space-y-5">
        {error && (
          <Notice tone="error" title="That didn't work">
            <p>{error}</p>
          </Notice>
        )}

        {busy && <ProgressPanel steps={progress.steps} current={progress.current} elapsed={elapsed} />}

        {step === 1 && (
          <BrandForm values={inputs} setValues={setInputs} onSubmit={analyze} onExample={pickExample} onSample={loadSample} busy={busy === 'analyze'} disabled={Boolean(busy)} />
        )}

        {step === 2 && card && (
          <VoiceCardView key={cardVersion} card={card} setCard={setCard} research={research} cardWarnings={cardWarnings}
            builtHumour={builtHumour} toneChanged={toneChanged(card, cardSnap?.tone)} basis={evidenceBasis({ inputs: cardSnap?.inputs, research, card })} onGenerate={generate} onRebuild={analyze} outdated={stale.cardOutdated} onBack={() => setStep(1)} busy={busy === 'generate'} rebuilding={busy === 'analyze'} sampleNote={sampleNote} />
        )}

        {step === 3 && tweetResult && tweetSnap && (
          <TweetsView tweets={tweetResult.tweets} checks={tweetResult.checks} plan={tweetResult.plan} warnings={tweetResult.warnings || []}
            {...tweetsDisplay(tweetSnap)} basis={evidenceBasis({ inputs: tweetSnap.inputs, research: tweetSnap.research, card: tweetSnap.card })} maxLength={tweetSnap.inputs.maxLength} stale={stale.tweets} onRebuild={analyze} onRegenerateAll={generate} busy={Boolean(busy)}
            onRegenerate={regenerate} regeneratingSlot={regeneratingSlot} onBack={() => setStep(2)} onStartOver={startOver}
            sampleNote={sampleNote} regenError={regenError} />
        )}

        <HowItWorks />
      </div>

      <footer className="mt-10 space-y-2 text-xs text-muted">
        <p>Tweets are AI-drafted. Grounded in your brief, with checks for unsupported details. Review facts before posting.</p>
        <p>
          Built by Nipun Rikapu for the Walnut Folks / Confluencr assignment ·{' '}
          <FooterLink href={REPO_URL}>GitHub</FooterLink> · <FooterLink href={APPROACH_DOC_URL}>Approach doc</FooterLink>
        </p>
      </footer>
    </div>
  );
}
