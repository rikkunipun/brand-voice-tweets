'use client';
import { INPUT_LIMITS } from '@/lib/config.js';
import { AutoTextarea, Button, Card, Counter, Spinner } from './ui.jsx';

export const OBJECTIVES = ['Engagement', 'Promotion', 'Awareness', 'Product launch'];

const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand';

function Field({ id, label, hint, optional, required, value, max, children }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
          {required && <span className="text-red-600"> *</span>}
          {optional && <span className="font-normal text-muted"> (optional)</span>}
        </label>
        {max ? <Counter value={value} max={max} /> : null}
      </div>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default function BrandForm({ values, setValues, onSubmit, onExample, onSample, busy, disabled }) {
  const set = (key) => (e) => setValues({ ...values, [key]: e.target.value });
  const canSubmit = values.products.trim().length > 0 && !busy && !disabled;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }}
      className="space-y-5"
    >
      <Card>
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Not sure where to start?</span>
          <Button onClick={() => onExample('zomato')} disabled={busy}>Try an example: Zomato</Button>
          <Button onClick={() => onExample('millet')} disabled={busy}>Try an example: Millet snacks</Button>
          <span className="text-sm text-muted">
            or{' '}
            <button type="button" onClick={() => onSample('zomato')} className="font-medium text-brand underline underline-offset-2 hover:text-brand-dark" disabled={busy}>
              see a sample result
            </button>
            <span className="hidden sm:inline"> (instant, no API call)</span>
          </span>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="brandName" label="Brand name" optional value={values.brandName} max={INPUT_LIMITS.brandName}
            hint="If given, we look for the brand's own posts online to learn its real voice.">
            <input id="brandName" className={field} value={values.brandName} maxLength={INPUT_LIMITS.brandName} onChange={set('brandName')} placeholder="e.g. Zomato" autoComplete="off" />
          </Field>
          <Field id="industry" label="Industry" optional value={values.industry} max={INPUT_LIMITS.industry}>
            <input id="industry" className={field} value={values.industry} maxLength={INPUT_LIMITS.industry} onChange={set('industry')} placeholder="e.g. Food delivery and dining out" autoComplete="off" />
          </Field>
        </div>

        <div className="mt-5 grid gap-5">
          <Field id="objective" label="Campaign objective" required value={values.objective}
            hint="Decides the mix of engaging, promotional, witty and informative tweets.">
            <select id="objective" className={field} value={values.objective} onChange={set('objective')}>
              {OBJECTIVES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>

          <Field id="products" label="About the products" required value={values.products} max={INPUT_LIMITS.products}
            hint="What you sell and anything the tweets may mention: product names, flavours, features, offers. Tweets never go beyond this.">
            <AutoTextarea id="products" minRows={3} className={field} value={values.products} maxLength={INPUT_LIMITS.products} onChange={set('products')} placeholder="e.g. Millet-based chips and cookies made in Hyderabad. No maida, no palm oil. Launching a Snack Box sampler with 6 flavours." />
          </Field>

          <Field id="pastPosts" label="Past posts" optional value={values.pastPosts} max={INPUT_LIMITS.pastPosts}
            hint="One post per line. This improves accuracy more than anything else here: a handful of the brand's real posts teaches the voice better than any description.">
            <AutoTextarea id="pastPosts" minRows={5} className={field} value={values.pastPosts} maxLength={INPUT_LIMITS.pastPosts} onChange={set('pastPosts')} placeholder={'Paste 3-10 real posts, one per line'} />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="toneWords" label="Tone words" optional value={values.toneWords} max={INPUT_LIMITS.toneWords}>
              <input id="toneWords" className={field} value={values.toneWords} maxLength={INPUT_LIMITS.toneWords} onChange={set('toneWords')} placeholder="e.g. warm, playful, a little desi" autoComplete="off" />
            </Field>
            <Field id="instructions" label="Must-follow instructions" optional value={values.instructions} max={INPUT_LIMITS.instructions}
              hint="These always win over anything we find.">
              <input id="instructions" className={field} value={values.instructions} maxLength={INPUT_LIMITS.instructions} onChange={set('instructions')} placeholder="e.g. Never mention competitors" autoComplete="off" />
            </Field>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={!canSubmit} className="px-5 py-2.5">
          {busy ? <><Spinner /> Working…</> : 'Build Voice Card'}
        </Button>
        {!values.products.trim() && <span className="text-sm text-muted">Describe the products to continue.</span>}
      </div>
    </form>
  );
}
