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

const EMPTY_INPUTS = { brandName: '', industry: '', objective: 'Engagement', products: '', toneWords: '', pastPosts: '', instructions: '' };
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

function StepIndicator({ step, reachable, onGo }) {
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
                <span className={`truncate font-medium ${active ? 'text-brand' : ''}`}>{name}</span>
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
  const [research, setResearch] = useState(null);
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
      setCard(s.card);
      setCardVersion((v) => v + 1);
      setResearch(s.research);
      setCardWarnings(s.cardWarnings || []);
      setTweetResult({ plan: s.plan, tweets: s.tweets, checks: s.checks });
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
      const result = await streamPost('/api/analyze', { inputs }, (ev) => {
        if (ev.type === 'progress') setSeen((s) => [...s, ev.step === 'research' ? 'research' : ev.cached ? 'saved' : ev.step]);
      });
      setCard(result.card);
      setCardVersion((v) => v + 1);
      setResearch(result.research);
      setCardWarnings(result.cardWarnings || []);
      setTweetResult(null);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    setError('');
    setSeen([]);
    setBusy('generate');
    // Empty tone traits (added but never filled in) are dropped.
    const cleaned = { ...card, tone: card.tone.filter((t) => t.trait.trim()) };
    try {
      const result = await streamPost('/api/generate', { inputs, card: cleaned }, (ev) => {
        if (ev.type === 'progress') setSeen((s) => [...s, ev.step]);
      });
      setCard(cleaned);
      setTweetResult({ plan: result.plan, tweets: result.tweets, checks: result.checks });
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
      const { tweet, checks } = await postJson('/api/regenerate', { inputs, card, slot, tweets: tweetResult.tweets });
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
    setSample('');
    setError('');
    setInputs(EMPTY_INPUTS);
  }

  const analyzeSteps = inputs.brandName.trim()
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
          Tell us about a brand. We build a Voice Card that shows where every trait comes from, then write 10 on-brand tweets you can edit, regenerate and copy.
        </p>
      </header>

      <StepIndicator step={step} reachable={reachable} onGo={(n) => !busy && setStep(n)} />

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
            hasPosts={Boolean(inputs.pastPosts.trim())} onGenerate={generate} onBack={() => setStep(1)} busy={busy === 'generate'} sampleNote={sampleNote} />
        )}

        {step === 3 && tweetResult && card && (
          <TweetsView tweets={tweetResult.tweets} checks={tweetResult.checks} summary={card.voice_summary} displayName={card.brand_display_name}
            brandLabel={inputs.brandName.trim() || 'Your brand'}
            onRegenerate={regenerate} regeneratingSlot={regeneratingSlot} onBack={() => setStep(2)} onStartOver={startOver}
            sampleNote={sampleNote} regenError={regenError} />
        )}

        <HowItWorks />
      </div>

      <footer className="mt-10 space-y-2 text-xs text-muted">
        <p>Tweets are AI-drafted. Review facts and tone before posting. The tool never invents offers, prices or claims that are not in your brief.</p>
        <p>
          Built by Nipun Rikapu for the Walnut Folks / Confluencr assignment ·{' '}
          <FooterLink href={REPO_URL}>GitHub</FooterLink> · <FooterLink href={APPROACH_DOC_URL}>Approach doc</FooterLink>
        </p>
      </footer>
    </div>
  );
}
