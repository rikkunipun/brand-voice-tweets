// Verifies what this API key can actually do before we build on it.
// Costs well under one cent: one tiny call plus one web search.
import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY. Copy .env.example to .env and add your key.');
  process.exit(1);
}

const client = new OpenAI();
const model = process.env.MODEL_DEFAULT || 'gpt-5-mini';
const effort = process.env.REASONING_EFFORT || 'low';
const reasoning = effort === 'none' ? {} : { reasoning: { effort } };

console.log('\n1) Models this key can use (text models only):');
const ids = [];
for await (const m of client.models.list()) ids.push(m.id);
const textModels = ids.filter((id) => /^(gpt-|o\d)/.test(id) && !/audio|realtime|tts|transcribe|image|search-preview/.test(id)).sort();
console.log('   ' + textModels.join('\n   '));
console.log(`\n   MODEL_DEFAULT = ${model} -> ${ids.includes(model) ? 'AVAILABLE' : 'NOT FOUND in list (pick one above)'}`);

console.log('\n2) Plain call...');
try {
  const r = await client.responses.create({ model, input: 'Reply with the single word OK.', ...reasoning });
  console.log(`   OK: "${r.output_text.trim()}"  tokens in/out: ${r.usage.input_tokens}/${r.usage.output_tokens}`);
} catch (e) {
  console.log(`   FAILED: ${e.message}`);
  console.log('   If the error mentions "reasoning", set REASONING_EFFORT=none in .env.');
  process.exit(1);
}

console.log('\n3) Web search call...');
try {
  const r = await client.responses.create({
    model,
    tools: [{ type: 'web_search' }],
    input: "What is Zomato's official handle on X (Twitter)? Answer in one line.",
    ...reasoning,
  });
  const searches = r.output.filter((o) => o.type === 'web_search_call').length;
  const cites = r.output.flatMap((o) => (o.type === 'message' ? o.content.flatMap((c) => c.annotations || []) : [])).filter((a) => a.type === 'url_citation');
  console.log(`   Answer: ${r.output_text.trim()}`);
  console.log(`   Searches: ${searches}  Citations: ${cites.length}  tokens in/out: ${r.usage.input_tokens}/${r.usage.output_tokens}`);
  console.log(searches > 0 ? '   WEB SEARCH WORKS' : '   Model answered without searching; research may be unreliable on this model.');
} catch (e) {
  console.log(`   WEB SEARCH FAILED: ${e.message}`);
  console.log('   The app still works: research is optional and will be skipped.');
}
console.log('');
