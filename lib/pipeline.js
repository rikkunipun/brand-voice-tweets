import { getConfig, INPUT_LIMITS, normalizeMaxLength } from './config.js';
import { callModel, parseJson, extractCitations, createMeter, estimateCost } from './openai.js';
import { VOICE_CARD_SCHEMA, TWEETS_SCHEMA, CRITIC_SCHEMA } from './schemas.js';
import {
  RESEARCH_INSTRUCTIONS, ANALYSIS_INSTRUCTIONS, tweetInstructions, criticInstructions,
  buildResearchInput, buildAnalysisInput, buildTweetInput, buildCriticInput, buildBrief, buildRegenerateInput,
} from './prompts.js';
import { planMix } from './plan.js';
import { checkSet, verifyVoiceExamples } from './checks.js';

export function normalizeInputs(raw = {}) {
  const out = {};
  for (const [key, max] of Object.entries(INPUT_LIMITS)) {
    out[key] = typeof raw[key] === 'string' ? raw[key].trim().slice(0, max) : '';
  }
  // Research is on unless the caller switched it off (the form's "Research this brand online").
  out.research = raw.research !== false;
  out.maxLength = normalizeMaxLength(raw.maxLength);
  if (!out.products && !out.brandName) {
    throw new Error('Give at least a brand name or a description of the products.');
  }
  return out;
}

// Step 1 (optional): web research. Never fatal: if it fails, the pipeline continues on user inputs.
export async function researchBrand(inputs, { meter, client, skipResearch } = {}) {
  if (inputs.research === false) skipResearch = true;
  if (!inputs.brandName) return { status: 'skipped', reason: 'no brand name given', notes: '', sources: [] };
  if (skipResearch) return { status: 'skipped', reason: 'research turned off', notes: '', sources: [] };
  try {
    const res = await callModel({
      step: 'research',
      model: getConfig().models.research,
      instructions: RESEARCH_INSTRUCTIONS,
      input: buildResearchInput(inputs),
      tools: [{ type: 'web_search' }],
      meter,
      client,
    });
    const notes = (res.output_text || '').trim();
    const sources = extractCitations(res);
    if (!notes) return { status: 'failed', reason: 'search returned nothing', notes: '', sources };
    return { status: 'found', reason: '', notes, sources };
  } catch (err) {
    return { status: 'failed', reason: err.message, notes: '', sources: [] };
  }
}

// Step 2: build the Voice Card from form inputs, pasted posts and research notes.
export async function analyzeBrand(rawInputs, opts = {}) {
  const inputs = normalizeInputs(rawInputs);
  // opts.research lets a caller reuse saved research instead of searching again.
  const research = opts.research || (await researchBrand(inputs, opts));
  const res = await callModel({
    step: 'analysis',
    model: getConfig().models.analysis,
    instructions: ANALYSIS_INSTRUCTIONS,
    input: buildAnalysisInput(inputs, research),
    schema: VOICE_CARD_SCHEMA,
    schemaName: 'voice_card',
    meter: opts.meter,
    client: opts.client,
  });
  const verified = verifyVoiceExamples(parseJson(res, 'analysis'), inputs, research);
  const { warnings } = verified;
  let { card } = verified;
  // An audience the user typed is user-defined by definition; the model's label is not trusted for it.
  if (inputs.audience) card = { ...card, target_audience: { ...card.target_audience, evidence: 'user-defined' } };
  return { inputs, research, card, cardWarnings: warnings };
}

// Steps 3-5: plan the mix, write tweets, run code checks, then one critic pass to revise weak ones.
export async function generateTweets(rawInputs, card, opts = {}) {
  const inputs = normalizeInputs(rawInputs);
  const { meter, client, critic = true, onStep } = opts; // onStep('writing' | 'checking' | 'editing') reports progress
  const cfg = getConfig();
  const plan = planMix(inputs.objective, card.content_themes, { humourAllowed: card.humour_allowed !== false });
  // The BRIEF and brand name feed the checks for invented numbers and brand-name overuse.
  const ctx = { brief: buildBrief(inputs), brandName: inputs.brandName, maxLength: inputs.maxLength };

  onStep?.('writing');
  const res = await callModel({
    step: 'tweets',
    model: cfg.models.tweets,
    instructions: tweetInstructions(inputs.maxLength),
    input: buildTweetInput(inputs, card, plan),
    schema: TWEETS_SCHEMA,
    schemaName: 'tweets',
    meter,
    client,
  });
  const written = parseJson(res, 'tweets').tweets || [];

  // The plan decides each slot's style; the model's text is matched to slots in order.
  let tweets = plan.slots.map((s, i) => {
    const t = written.find((w) => w.slot === s.slot) || written[i] || { text: '', why: '' };
    return { slot: s.slot, style: s.style, angle: s.angle, theme: s.theme, text: (t.text || '').trim(), why: t.why || '', revised: false, revisionReason: '', originalText: '' };
  });

  onStep?.('checking');
  const firstChecks = checkSet(tweets, card, plan, ctx);
  const rejectedRevisions = [];
  const warnings = [];

  if (critic) {
    onStep?.('editing');
    // The editor pass is an upgrade, not a requirement: if it fails, the checked drafts are still returned.
    let reviews = [];
    try {
      const cres = await callModel({
        step: 'critic',
        model: cfg.models.critic,
        instructions: criticInstructions(inputs.maxLength),
        input: buildCriticInput(inputs, card, tweets, firstChecks),
        schema: CRITIC_SCHEMA,
        schemaName: 'critic',
        meter,
        client,
      });
      reviews = parseJson(cres, 'critic').reviews || [];
    } catch (err) {
      console.error('[critic] failed:', err.message);
      warnings.push("The editor pass didn't finish, so these are the first drafts, checked by code only. Read them closely before posting.");
    }
    // Apply revisions one at a time, checking each against the whole set (so a rewrite
    // cannot introduce a duplicate or repeated opening). Accept only if it adds no failures.
    for (const r of reviews) {
      if (r.verdict !== 'revise' || !r.revised_text?.trim()) continue;
      const idx = tweets.findIndex((t) => t.slot === r.slot);
      if (idx === -1) continue;
      const before = checkSet(tweets, card, plan, ctx);
      const candidate = tweets.map((t, i) => (i === idx ? { ...t, text: r.revised_text.trim() } : t));
      const after = checkSet(candidate, card, plan, ctx);
      const beforeIssues = before.perTweet[idx].issues;
      const afterIssues = after.perTweet[idx].issues;
      // Failures the rewrite causes in OTHER tweets (e.g. a new repeated opening or duplicate).
      const addedElsewhere = [];
      after.perTweet.forEach((p, i) => {
        if (i === idx) return;
        const had = new Set(before.perTweet[i].issues.map((x) => x.code));
        for (const issue of p.issues) if (!had.has(issue.code)) addedElsewhere.push(`Tweet ${p.slot}: ${issue.message}`);
      });
      // Accept only if the rewrite introduces no issue code the original did not already have.
      const hadOwn = new Set(beforeIssues.map((x) => x.code));
      const addedOwn = afterIssues.filter((x) => !hadOwn.has(x.code));
      if (addedOwn.length || addedElsewhere.length) {
        // Record the rejection instead of dropping it silently.
        rejectedRevisions.push({
          slot: r.slot,
          originalText: tweets[idx].text,
          rejectedText: r.revised_text.trim(),
          reason: r.reason,
          failedChecks: [...addedOwn.map((i) => i.message), ...addedElsewhere],
          originalChecks: beforeIssues.map((i) => i.message),
        });
        continue;
      }
      tweets[idx] = { ...tweets[idx], text: r.revised_text.trim(), revised: true, revisionReason: r.reason, originalText: tweets[idx].text };
    }
  }

  const checks = checkSet(tweets, card, plan, ctx);
  const firstPassIssues = firstChecks.perTweet
    .filter((p) => p.issues.length)
    .map((p) => ({ slot: p.slot, issues: p.issues.map((i) => ({ code: i.code, message: i.message })) }));
  return { plan, tweets, checks, firstPassChecks: firstChecks.summary, firstPassIssues, rejectedRevisions, warnings };
}

const REGENERATE_ATTEMPTS = 3;

// Replace one tweet, keeping its slot, style, angle and theme. The new tweet is checked against the whole set;
// if it fails a check (or breaks another tweet) the model is told what failed and tries again.
export async function regenerateTweet(rawInputs, card, tweets, slot, opts = {}) {
  const inputs = normalizeInputs(rawInputs);
  const { meter, client } = opts;
  const idx = tweets.findIndex((t) => t.slot === slot);
  if (idx === -1) throw new Error(`There is no tweet in slot ${slot}.`);
  const current = tweets[idx];
  const themeInfo = (card.content_themes || []).find((t) => t.theme === current.theme);
  const slotInfo = { slot, style: current.style, angle: current.angle, theme: current.theme || '', themeDetail: themeInfo?.detail || '' };
  const others = tweets.filter((_, i) => i !== idx);
  const ctx = { brief: buildBrief(inputs), brandName: inputs.brandName, maxLength: inputs.maxLength };
  const baseline = checkSet(tweets, card, undefined, ctx);

  let feedback = [];
  let best = null;
  for (let attempt = 1; attempt <= REGENERATE_ATTEMPTS; attempt++) {
    const res = await callModel({
      step: 'regenerate',
      model: getConfig().models.tweets,
      instructions: tweetInstructions(inputs.maxLength),
      input: buildRegenerateInput(inputs, card, slotInfo, others, current, feedback),
      schema: TWEETS_SCHEMA,
      schemaName: 'tweets',
      meter,
      client,
    });
    const written = (parseJson(res, 'regenerate').tweets || [])[0] || {};
    const text = (written.text || '').trim();
    if (!text) continue;
    const candidate = tweets.map((t, i) => (i === idx ? { ...t, text } : t));
    const checks = checkSet(candidate, card, undefined, ctx);
    const own = checks.perTweet[idx].issues;
    // Failures the new tweet causes in OTHER tweets (a new repeated opening, near-duplicate, brand-name overuse...).
    const added = [];
    checks.perTweet.forEach((p, i) => {
      if (i === idx) return;
      const had = new Set(baseline.perTweet[i].issues.map((x) => x.code));
      for (const issue of p.issues) if (!had.has(issue.code)) added.push(`Tweet ${p.slot}: ${issue.message}`);
    });
    const problems = [...own.map((x) => x.message), ...added];
    if (text.toLowerCase() === current.text.toLowerCase()) problems.push('It is the same as the tweet being replaced; write something different');
    const tweet = { slot, style: current.style, angle: current.angle, theme: current.theme || '', text, why: written.why || '', revised: false, revisionReason: '', originalText: '', regenerated: true };
    if (!best || problems.length < best.problems.length) best = { tweet, problems };
    if (!problems.length) break;
    feedback = problems;
  }
  if (!best) throw new Error('The model returned an empty tweet. Please try again.');
  const finalSet = tweets.map((t, i) => (i === idx ? best.tweet : t));
  return { tweet: best.tweet, checks: checkSet(finalSet, card, undefined, ctx) };
}

export async function runPipeline(rawInputs, opts = {}) {
  const meter = opts.meter || createMeter();
  const started = Date.now();
  const { inputs, research, card, cardWarnings } = await analyzeBrand(rawInputs, { ...opts, meter });
  const generated = await generateTweets(inputs, card, { ...opts, meter });
  return {
    inputs,
    research,
    card,
    cardWarnings,
    ...generated,
    usage: { calls: meter.calls, ...estimateCost(meter), ms: Date.now() - started },
  };
}
