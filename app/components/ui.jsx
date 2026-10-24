'use client';
// Small shared pieces.
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

export function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ title, aside, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 sm:p-6 ${className}`}>
      {(title || aside) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

const BUTTONS = {
  primary: 'bg-brand text-white hover:bg-brand-dark disabled:bg-slate-300 disabled:text-slate-500',
  secondary: 'border border-line bg-surface text-ink hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-brand hover:bg-brand-soft disabled:text-slate-400',
};

export function Button({ variant = 'secondary', className = '', ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed ${BUTTONS[variant]} ${className}`}
    />
  );
}

export function Notice({ tone = 'info', title, children }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warn: 'border-yellow-300 bg-yellow-50 text-yellow-900',
    error: 'border-red-200 bg-red-50 text-red-900',
  };
  return (
    <div role={tone === 'error' ? 'alert' : undefined} className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {title && <p className="mb-1 font-semibold">{title}</p>}
      {children}
    </div>
  );
}

export function ProgressPanel({ steps, current, elapsed }) {
  const currentIndex = Math.max(0, steps.findIndex((s) => s.key === current));
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6" role="status" aria-live="polite">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-semibold">Working on it…</p>
        <p className="text-sm tabular-nums text-muted">{elapsed}s</p>
      </div>
      <ol className="space-y-2">
        {steps.map((s, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <li key={s.key} className={`flex items-start gap-3 text-sm ${done || active ? 'text-ink' : 'text-slate-400'}`}>
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                {done ? (
                  <svg viewBox="0 0 20 20" className="h-5 w-5 text-emerald-600" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0z" clipRule="evenodd" />
                  </svg>
                ) : active ? (
                  <Spinner className="h-4 w-4 text-brand" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-slate-300" />
                )}
              </span>
              <span>
                {s.label}
                {active && s.hint && <span className="block text-muted">{s.hint}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function Counter({ value, max }) {
  const len = value.length;
  const tone = len >= max ? 'text-red-600' : len >= max * 0.9 ? 'text-amber-600' : 'text-muted';
  return (
    <span className={`text-xs tabular-nums ${tone}`} aria-live="off">
      {len}/{max}
    </span>
  );
}

// A textarea that grows to fit its text, so nothing is ever cut off. It also re-fits when its width changes,
// which covers a collapsed <details> being opened (a hidden textarea measures 0).
export function AutoTextarea({ minRows = 2, className = '', value, onChange, ...props }) {
  const ref = useRef(null);
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el || el.offsetParent === null) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  }, []);
  useLayoutEffect(fit, [value, fit]);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let width = el.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (el.offsetWidth !== width) {
        width = el.offsetWidth;
        fit();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);
  return <textarea ref={ref} rows={minRows} value={value} onChange={onChange} className={`resize-none overflow-hidden ${className}`} {...props} />;
}

// A collapsible card: <details> with a title row and an optional short summary on the right.
export function Section({ title, meta, defaultOpen = false, children }) {
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 text-base font-semibold">
          <span className="inline-block text-xs text-muted transition-transform group-open:rotate-90" aria-hidden="true">▶</span>
          {title}
        </span>
        {meta && <span className="text-right text-xs text-muted">{meta}</span>}
      </summary>
      <div className="border-t border-line px-5 py-5 sm:px-6">{children}</div>
    </details>
  );
}
