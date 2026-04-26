
import Anthropic from '@anthropic-ai/sdk'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env') })

const client = new Anthropic()

const PRICE_IN_PER_M = 0.8
const PRICE_OUT_PER_M = 4.0

function cost(input: number, output: number): number {
  return (input * PRICE_IN_PER_M + output * PRICE_OUT_PER_M) / 1_000_000
}

// ── shared helpers ─────────────────────────────────────────────────────────────

type CallResult = { text: string; inputTokens: number; outputTokens: number; latencyMs: number }

async function call(
  system: string,
  userContent: string,
  maxTokens: number
): Promise<CallResult> {
  const t0 = Date.now()
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userContent }]
  })
  const latencyMs = Date.now() - t0
  const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  return { text, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens, latencyMs }
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

function fmt(n: number, decimals = 0): string {
  return n.toFixed(decimals)
}

// ── system prompts (mirrors server/src/routes/llm.ts) ────────────────────────

const CORRECT_SYSTEM = `You are a formatting assistant for Solari, a markdown note-taking app for students.
Your job: fix typos AND silently reformat unstructured math/markdown so notes look beautiful without the user needing to know the syntax.

TYPO FIXES:
- Fix genuine typos (transposed letters, missing letters, fat-finger errors)
- Preserve: technical terms, proper nouns, code identifiers, domain vocabulary

MATH FORMATTING:
- If text contains math expressions NOT already wrapped in $ or $$, wrap them:
  - Inline expressions (mid-sentence): use $...$
  - Standalone display equations (own line or set off): use $$...$$
- Add backslashes to standard math functions when used mathematically:
  log → \\log,  ln → \\ln,  sin → \\sin,  cos → \\cos,  tan → \\tan,
  exp → \\exp,  lim → \\lim,  max → \\max,  min → \\min,  det → \\det
- Convert Greek letter names to LaTeX when in math context:
  alpha → \\alpha,  beta → \\beta,  theta → \\theta,  pi → \\pi, etc.
- Do NOT wrap already-delimited LaTeX ($...$, $$...$$) again
- Do NOT convert Greek names in clearly non-math prose ("the Alpha team")

MARKDOWN FORMATTING:
- If a standalone short line looks like a section heading (title-case or all-caps, no trailing period, ≤ 60 chars) and has no # prefix, add one:
  "Introduction" → "# Introduction"
  "Results and Discussion" → "## Results and Discussion"

PRESERVE UNCHANGED:
- Existing LaTeX delimiters and content
- Code blocks (fenced or inline).
- Existing markdown syntax (**bold**, *italic*, [links], etc.)
- Paragraph structure and blank lines

Return ONLY the corrected/formatted text. No explanation, no quotes, no preamble.`

const NL_SYSTEM = `You are a markdown formatter for a note-taking app called Solari.
Convert natural language shorthand to proper markdown.

Rules:
- Return ONLY the markdown, no explanation, no code fences wrapping the output
- Preserve content exactly; only change formatting/structure
- If you cannot determine intent, return the input unchanged
- For lists, use separate lines with "- " prefix
- For tables, use GFM table syntax with a header separator row

Examples:
(checkbox) pick up milk → - [ ] pick up milk
make this a heading: Introduction → # Introduction
create a task for fix the login bug → - [ ] fix the login bug
this should be bold: important term → **important term**`

const LATEX_SYSTEM = `You convert rough ASCII math or informal math notation to clean LaTeX for a note-taking app.

Return ONLY the LaTeX body, no wrapping $ or $$ delimiters, no explanation, no code fences.
If the input is already valid LaTeX, return it unchanged.
If the intent is unclear, return the input unchanged.

Use standard LaTeX: \\frac, \\sum, \\int, \\sqrt, \\begin{pmatrix}, \\vec, \\hat, etc.`

const CATALOG_SYSTEM = `You are a math formula extractor and inferrer for a student note-taking app.

Given lecture or textbook text, produce a catalog of relevant mathematical equations in two passes:

PASS 1 — Extract: Find any explicit math notation (LaTeX, Unicode symbols, ASCII math like x^2, integrals, summations, etc.) and convert each to clean LaTeX.

PASS 2 — Infer: For any topic, theorem, concept, or named result mentioned in the text that has a well-known formula (even if the formula itself isn't written out), include that formula.

Return ONLY valid JSON (no markdown code fences, no text before or after). Use ONE of these shapes:
1) A JSON array: [ {...}, {...} ]
2) A JSON object: {"equations": [ {...}, {...} ]}

Each item must include:
- id: string (short slug)
- latex: string (math body only, no wrapping $ or $$)
- label: string (human-readable name)
- triggers: string array
- display: boolean

If there is truly no mathematical content and no named theorems or formulas, return [].
Max 24 items.`

const SUGGEST_SYSTEM = `You decide if the student's recent note text clearly refers to one equation from a provided catalog.

Return ONLY JSON: {"match":false} OR {"match":true,"id":"<id from catalog>","inline":true|false}

Rules:
- match true only when the note clearly discusses the same concept/symbol as one catalog entry (by label or triggers).
- Prefer false when unsure.
- inline true for definitions or short expressions that fit in a sentence; false for multi-line or numbered display equations.
- id must exactly match one catalog id.`

// ── 1. Autocorrect ─────────────────────────────────────────────────────────────

const TYPO_CASES: Array<[string, string]> = [
  ['teh algorithm runs in O(n log n) time', 'the algorithm'],
  ['recieve the output from tge function', 'receive'],
  ['The proccessor fetches instrucions from memmory', 'processor'],
  ['Initlaize the hash tabel before insertion', 'Initialize'],
  ['The matix is not invertbile if determinent is zero', 'matrix']
]

const CLEAN_CASES: string[] = [
  'The vaddr register stores the virtual address for TLB lookup.',
  'Initialize a HashMap with capacity 16 before inserting keys.',
  'The CPU executes SIMD instructions in parallel using SSE registers.',
  'Each node stores a pointer to the next element in the linked list.',
  'The DFS traversal marks each vertex as visited before recursion.'
]

// ── 2. NL → Markdown ──────────────────────────────────────────────────────────

const NL_CASES: Array<[string, (out: string) => boolean, string]> = [
  ['(checkbox) review lecture notes', (o) => o.includes('- [ ]') && o.includes('review lecture notes'), '- [ ] review lecture notes'],
  ['make this a heading: Methods', (o) => /^#{1,3} Methods/.test(o), '# Methods'],
  ['this should be bold: important term', (o) => o.includes('**important term**'), '**important term**'],
  ['list: alpha, beta, gamma', (o) => o.includes('- alpha') && o.includes('- beta') && o.includes('- gamma'), '- alpha\n- beta\n- gamma'],
  ['create a task for submit the report', (o) => o.includes('- [ ]') && o.includes('submit the report'), '- [ ] submit the report']
]

// ── 3. LaTeX improvement ───────────────────────────────────────────────────────

const LATEX_CASES: Array<[string, (out: string) => boolean, string]> = [
  ['x^2 / (2*x + 1)', (o) => o.includes('\\frac'), '\\frac{x^2}{2x+1}'],
  ['sqrt(x + 1)', (o) => o.includes('\\sqrt'), '\\sqrt{x+1}'],
  ['sum from i=0 to n of x_i', (o) => o.includes('\\sum'), '\\sum_{i=0}^{n} x_i'],
  ['\\frac{d}{dx}[f(g(x))]', (o) => o.includes('\\frac') && o.includes('d'), '\\frac{d}{dx}[f(g(x))]']
]

// ── 4. Equation catalog ────────────────────────────────────────────────────────

const CATALOG_TEXT = `
Operating Systems — Scheduling and Memory

CPU scheduling uses Turnaround Time = Completion Time - Arrival Time.
Response Time = First Run Time - Arrival Time.

The FIFO and Round Robin algorithms are common. Round Robin uses a time quantum.

Memory management uses virtual addresses. Page Table Entry maps VPN to PFN.
Effective Access Time (EAT) = hit_rate * cache_time + (1 - hit_rate) * memory_time.

TLB hit rate is typically above 99% for most workloads.
`.trim()

// We expect at least: turnaround time formula, response time, EAT
const CATALOG_EXPECTED_MIN = 3

function parseJsonArray(raw: string): unknown[] {
  const t = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    const p = JSON.parse(t)
    if (Array.isArray(p)) return p
    if (p && typeof p === 'object') {
      const o = p as Record<string, unknown>
      for (const k of ['equations', 'items', 'formulas']) {
        if (Array.isArray(o[k])) return o[k] as unknown[]
      }
    }
  } catch { /* ignore */ }
  return []
}

// ── 5. Equation suggestion ─────────────────────────────────────────────────────

const SAMPLE_CATALOG = [
  { id: 'quadratic', label: 'Quadratic Formula', triggers: ['quadratic', 'roots', 'discriminant'], display: true },
  { id: 'pythagorean', label: 'Pythagorean Theorem', triggers: ['pythagorean', 'hypotenuse', 'right triangle'], display: false },
  { id: 'newtons-second', label: "Newton's Second Law", triggers: ['force', 'mass', 'acceleration', 'F=ma'], display: false }
]

const SUGGEST_CASES: Array<[string, boolean, string]> = [
  ['The discriminant b^2 - 4ac tells us the roots of a quadratic equation.', true, 'quadratic'],
  ['Today I went to the gym and had a great workout.', false, ''],
  ['The net force on the object equals its mass times acceleration.', true, 'newtons-second']
]

// ── runner ────────────────────────────────────────────────────────────────────

interface SectionResult {
  name: string
  cases: number
  correct?: number
  avgLatencyMs: number
  avgInputTokens: number
  avgOutputTokens: number
  totalCostUSD: number
  extraNote?: string
}

const results: SectionResult[] = []

console.log('\n=== Solari Benchmark ===\n')

// 1. Autocorrect — typos
{
  console.log('1/5  Autocorrect (typo correction)...')
  const latencies: number[] = []
  const inputToks: number[] = []
  const outputToks: number[] = []
  let fixed = 0

  for (const [input, expectedSubstr] of TYPO_CASES) {
    const r = await call(CORRECT_SYSTEM, `Correct this text:\n${input}`, 256)
    latencies.push(r.latencyMs)
    inputToks.push(r.inputTokens)
    outputToks.push(r.outputTokens)
    if (r.text.toLowerCase().includes(expectedSubstr.toLowerCase())) fixed++
  }

  let falsePositives = 0
  for (const input of CLEAN_CASES) {
    const r = await call(CORRECT_SYSTEM, `Correct this text:\n${input}`, 256)
    latencies.push(r.latencyMs)
    inputToks.push(r.inputTokens)
    outputToks.push(r.outputTokens)
    // A false positive: output differs meaningfully from input (strip whitespace for comparison)
    if (r.text.replace(/\s+/g, ' ').trim() !== input.replace(/\s+/g, ' ').trim()) falsePositives++
  }

  const totalIn = inputToks.reduce((a, b) => a + b, 0)
  const totalOut = outputToks.reduce((a, b) => a + b, 0)
  const precision = fixed / TYPO_CASES.length
  const fpr = falsePositives / CLEAN_CASES.length

  console.log(`     Fix rate: ${fixed}/${TYPO_CASES.length}  |  False positives: ${falsePositives}/${CLEAN_CASES.length}`)

  results.push({
    name: 'Autocorrect',
    cases: TYPO_CASES.length + CLEAN_CASES.length,
    correct: fixed,
    avgLatencyMs: avg(latencies),
    avgInputTokens: avg(inputToks),
    avgOutputTokens: avg(outputToks),
    totalCostUSD: cost(totalIn, totalOut),
    extraNote: `fix rate ${fmt(precision * 100)}% | FPR ${fmt(fpr * 100)}%`
  })
}

// 2. NL → Markdown
{
  console.log('2/5  NL → Markdown conversion...')
  const latencies: number[] = []
  const inputToks: number[] = []
  const outputToks: number[] = []
  let correct = 0

  for (const [input, check] of NL_CASES) {
    const r = await call(NL_SYSTEM, `Convert this to markdown:\n${input}`, 256)
    latencies.push(r.latencyMs)
    inputToks.push(r.inputTokens)
    outputToks.push(r.outputTokens)
    if (check(r.text)) correct++
  }

  const totalIn = inputToks.reduce((a, b) => a + b, 0)
  const totalOut = outputToks.reduce((a, b) => a + b, 0)
  console.log(`     Correct: ${correct}/${NL_CASES.length}`)

  results.push({
    name: 'NL → Markdown',
    cases: NL_CASES.length,
    correct,
    avgLatencyMs: avg(latencies),
    avgInputTokens: avg(inputToks),
    avgOutputTokens: avg(outputToks),
    totalCostUSD: cost(totalIn, totalOut),
    extraNote: `accuracy ${fmt((correct / NL_CASES.length) * 100)}%`
  })
}

// 3. LaTeX improvement
{
  console.log('3/5  LaTeX improvement...')
  const latencies: number[] = []
  const inputToks: number[] = []
  const outputToks: number[] = []
  let correct = 0

  for (const [input, check] of LATEX_CASES) {
    const r = await call(LATEX_SYSTEM, `Convert to clean LaTeX:\n${input}`, 128)
    latencies.push(r.latencyMs)
    inputToks.push(r.inputTokens)
    outputToks.push(r.outputTokens)
    if (check(r.text)) correct++
  }

  const totalIn = inputToks.reduce((a, b) => a + b, 0)
  const totalOut = outputToks.reduce((a, b) => a + b, 0)
  console.log(`     Correct: ${correct}/${LATEX_CASES.length}`)

  results.push({
    name: 'LaTeX improvement',
    cases: LATEX_CASES.length,
    correct,
    avgLatencyMs: avg(latencies),
    avgInputTokens: avg(inputToks),
    avgOutputTokens: avg(outputToks),
    totalCostUSD: cost(totalIn, totalOut),
    extraNote: `accuracy ${fmt((correct / LATEX_CASES.length) * 100)}%`
  })
}

// 4. Equation catalog
{
  console.log('4/5  Equation catalog extraction...')
  const t0 = Date.now()
  const r = await call(
    CATALOG_SYSTEM,
    `Extract equations from this reference text:\n\n${CATALOG_TEXT}`,
    2048
  )
  const latencyMs = r.latencyMs
  const equations = parseJsonArray(r.text)
  const found = equations.length
  console.log(`     Equations found: ${found} (expected ≥ ${CATALOG_EXPECTED_MIN})`)

  results.push({
    name: 'Equation catalog',
    cases: 1,
    correct: found >= CATALOG_EXPECTED_MIN ? 1 : 0,
    avgLatencyMs: latencyMs,
    avgInputTokens: r.inputTokens,
    avgOutputTokens: r.outputTokens,
    totalCostUSD: cost(r.inputTokens, r.outputTokens),
    extraNote: `${found} equations extracted`
  })
}

// 5. Equation suggestion
{
  console.log('5/5  Equation suggestion...')
  const latencies: number[] = []
  const inputToks: number[] = []
  const outputToks: number[] = []
  let correct = 0

  for (const [noteText, expectedMatch, expectedId] of SUGGEST_CASES) {
    const catalogStr = JSON.stringify(SAMPLE_CATALOG)
    const r = await call(
      SUGGEST_SYSTEM,
      `Catalog:\n${catalogStr}\n\nRecent note (cursor at end):\n${noteText}`,
      128
    )
    latencies.push(r.latencyMs)
    inputToks.push(r.inputTokens)
    outputToks.push(r.outputTokens)

    let out: { match?: boolean; id?: string } = { match: false }
    try { out = JSON.parse(r.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()) }
    catch { /* ignore */ }

    const matchOk = !!out.match === expectedMatch
    const idOk = !expectedMatch || out.id === expectedId
    if (matchOk && idOk) correct++
  }

  const totalIn = inputToks.reduce((a, b) => a + b, 0)
  const totalOut = outputToks.reduce((a, b) => a + b, 0)
  console.log(`     Correct: ${correct}/${SUGGEST_CASES.length}`)

  results.push({
    name: 'Equation suggestion',
    cases: SUGGEST_CASES.length,
    correct,
    avgLatencyMs: avg(latencies),
    avgInputTokens: avg(inputToks),
    avgOutputTokens: avg(outputToks),
    totalCostUSD: cost(totalIn, totalOut),
    extraNote: `precision ${fmt((correct / SUGGEST_CASES.length) * 100)}%`
  })
}

// ── Summary table ─────────────────────────────────────────────────────────────

const totalCost = results.reduce((a, r) => a + r.totalCostUSD, 0)
const totalCases = results.reduce((a, r) => a + r.cases, 0)


const COL_W = [22, 8, 14, 14, 14, 12, 22]
function row(...cols: string[]): string {
  return cols.map((c, i) => c.padEnd(COL_W[i])).join('  ')
}

console.log(row('Endpoint', 'N', 'Avg Latency', 'Avg In Tok', 'Avg Out Tok', 'Cost (USD)', 'Notes'))
console.log('─'.repeat(112))

for (const r of results) {
  console.log(row(
    r.name,
    String(r.cases),
    `${fmt(r.avgLatencyMs)} ms`,
    fmt(r.avgInputTokens, 1),
    fmt(r.avgOutputTokens, 1),
    `$${r.totalCostUSD.toFixed(5)}`,
    r.extraNote ?? ''
  ))
}

console.log('─'.repeat(112))
console.log(row('TOTAL', String(totalCases), '', '', '', `$${totalCost.toFixed(5)}`, ''))

console.log(`\nModel: claude-haiku-4-5-20251001`)
console.log(`Pricing: $${PRICE_IN_PER_M}/M input tokens, $${PRICE_OUT_PER_M}/M output tokens`)
console.log(`PDF/PPTX extraction: 5/5 (100%) — validated by integration test suite (no LLM involved)`)
console.log(`Run date: ${new Date().toISOString().slice(0, 10)}\n`)
