import { normalizeInputs, researchBrand, analyzeBrand } from '@/lib/pipeline.js';
import { createMeter, estimateCost } from '@/lib/openai.js';
import { getCachedResearch, setCachedResearch } from '@/server/limits.js';
import { UserError, readJson, failure, limited, ndjson } from '@/server/http.js';

// Research (web search) can take around 90s, then the Voice Card call runs. Vercel's limit with Fluid Compute
// (the default) is 300s on every plan, so 300 leaves room for both.
export const maxDuration = 300;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  let inputs;
  try {
    inputs = normalizeInputs((await readJson(request)).inputs);
    if (!inputs.products) throw new UserError('Tell us a little about the products or services first.');
  } catch (err) {
    return failure(err, 400);
  }
  const blocked = limited(request, 'analyze');
  if (blocked) return blocked;

  return ndjson(async (send) => {
    const meter = createMeter();
    let research;
    let cached = false;
    if (!inputs.brandName) {
      research = { status: 'skipped', reason: 'no brand name given', notes: '', sources: [] };
    } else if (!inputs.research) {
      research = { status: 'skipped', reason: 'research turned off', notes: '', sources: [] };
    } else {
      const hit = getCachedResearch(inputs.brandName, inputs.industry);
      if (hit) {
        research = hit;
        cached = true;
      } else {
        send({ type: 'progress', step: 'research' });
        research = await researchBrand(inputs, { meter });
        setCachedResearch(inputs.brandName, inputs.industry, research);
      }
    }
    send({ type: 'progress', step: 'analysis', cached });
    const { card, cardWarnings } = await analyzeBrand(inputs, { meter, research });
    const usage = estimateCost(meter);
    console.log('[usage] analyze', JSON.stringify(usage));
    send({
      type: 'result',
      card,
      cardWarnings,
      // Raw error text from a failed search stays on the server.
      research: { status: research.status, reason: research.status === 'failed' ? 'the search did not finish' : research.reason, sources: research.sources, cached },
      usage,
    });
  });
}
