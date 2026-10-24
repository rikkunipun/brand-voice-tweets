import { normalizeInputs, regenerateTweet } from '@/lib/pipeline.js';
import { validateCard, validateTweets } from '@/lib/card.js';
import { createMeter, estimateCost } from '@/lib/openai.js';
import { UserError, readJson, failure, limited, jsonResponse } from '@/server/http.js';

// Up to 3 attempts of one short model call each.
export const maxDuration = 120;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  let inputs;
  let card;
  let tweets;
  let slot;
  try {
    const body = await readJson(request);
    inputs = normalizeInputs(body.inputs);
    if (!inputs.products) throw new UserError('Tell us a little about the products or services first.');
    card = validateCard(body.card);
    tweets = validateTweets(body.tweets);
    slot = body.slot;
    if (!Number.isInteger(slot)) throw new UserError('Pick a tweet to regenerate.');
  } catch (err) {
    return failure(err, 400);
  }
  const blocked = limited(request, 'regenerate');
  if (blocked) return blocked;

  try {
    const meter = createMeter();
    const { tweet, checks } = await regenerateTweet(inputs, card, tweets, slot, { meter });
    const usage = estimateCost(meter);
    console.log('[usage] regenerate', JSON.stringify(usage));
    return jsonResponse({ tweet, checks, usage });
  } catch (err) {
    return failure(err, 500);
  }
}
