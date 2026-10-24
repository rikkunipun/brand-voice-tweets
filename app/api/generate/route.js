import { generateTweets } from '@/lib/pipeline.js';
import { normalizeInputs } from '@/lib/pipeline.js';
import { validateCard } from '@/lib/card.js';
import { createMeter, estimateCost } from '@/lib/openai.js';
import { UserError, readJson, failure, limited, ndjson } from '@/server/http.js';

// Three model calls in a row (write, then the editor pass). 300s is the Fluid Compute limit on every plan.
export const maxDuration = 300;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  let inputs;
  let card;
  try {
    const body = await readJson(request);
    inputs = normalizeInputs(body.inputs);
    if (!inputs.products) throw new UserError('Tell us a little about the products or services first.');
    card = validateCard(body.card);
  } catch (err) {
    return failure(err, 400);
  }
  const blocked = limited(request, 'generate');
  if (blocked) return blocked;

  return ndjson(async (send) => {
    const meter = createMeter();
    const { plan, tweets, checks } = await generateTweets(inputs, card, {
      meter,
      onStep: (step) => send({ type: 'progress', step }),
    });
    const usage = estimateCost(meter);
    console.log('[usage] generate', JSON.stringify(usage));
    send({ type: 'result', plan, tweets, checks, usage });
  });
}
