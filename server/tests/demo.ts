// Run with: npx tsx tests/demo.ts
import '../src/env.js'
import { createApp } from '../src/app.js'
import { createTestPptx, OS_SLIDE_TEXT } from './helpers/fixtures.js'
import type { AddressInfo } from 'node:net'

const app = createApp()
const server = await new Promise<ReturnType<typeof app.listen>>((res) => {
  const s = app.listen(0, () => res(s))
})
const { port } = server.address() as AddressInfo
const base = `http://localhost:${port}`

async function post(path: string, body: unknown): Promise<unknown> {
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

async function postRaw(path: string, buf: Buffer, ct: string): Promise<unknown> {
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': ct },
    body: buf,
  })
  return r.json()
}

let passed = 0
let failed = 0

function check(label: string, input: string, expected: string, actual: string, ok: boolean) {
  const icon = ok ? '✅ PASS' : '❌ FAIL'
  console.log(`\n${'─'.repeat(72)}`)
  console.log(`${icon}  ${label}`)
  console.log(`  INPUT    : ${input}`)
  console.log(`  EXPECTED : ${expected}`)
  console.log(`  ACTUAL   : ${actual}`)
  if (!ok) console.log(`  WHY FAIL : actual output did not satisfy the expectation above`)
  ok ? passed++ : failed++
}

console.log('\n══════════════════════════════════════════════════════════════════════')
console.log('  SOLARI INTEGRATION DEMO — real API calls, real responses')
console.log('══════════════════════════════════════════════════════════════════════')

console.log('\n\n📌  /api/correct — paragraph autocorrect\n')

{
  const input = 'The quikc brown fox jmups over the lzy dog.'
  const res = (await post('/api/correct', { text: input })) as { corrected: string }
  const actual = res.corrected
  check(
    'Fixes common typos (quikc→quick, jmups→jumps, lzy→lazy)',
    input,
    'contains "quick", "jumps", "lazy"',
    actual,
    /quick/i.test(actual) && /jumps/i.test(actual) && /lazy/i.test(actual)
  )
}

{
  const input = 'The vaddr is mapped thorugh the TLB beofre hitting the paeg table.'
  const res = (await post('/api/correct', { text: input })) as { corrected: string }
  const actual = res.corrected
  check(
    'Fixes typos but preserves technical terms (vaddr, TLB)',
    input,
    'contains "vaddr" and "TLB" unchanged; "through" and "before" fixed',
    actual,
    /vaddr/.test(actual) && /TLB/.test(actual) && /through/i.test(actual) && /before/i.test(actual)
  )
}

{
  const input = 'The formula is $\\frac{a}{b}$ and the eequation must be preservd.'
  const res = (await post('/api/correct', { text: input })) as { corrected: string }
  const actual = res.corrected
  check(
    'Leaves LaTeX intact while fixing prose typos',
    input,
    'contains "$\\\\frac{a}{b}$" verbatim; "preserved" fixed',
    actual,
    actual.includes('$\\frac{a}{b}$') && /preserved/i.test(actual)
  )
}

console.log('\n\n📌  /api/correct-word — single-word correction\n')

{
  const res = (await post('/api/correct-word', {
    word: 'teh',
    contextBefore: 'I need',
    contextAfter: 'help.',
  })) as { corrected: string }
  const actual = res.corrected
  check(
    'Corrects "teh" → "the" (transposed letters)',
    'word="teh", context="I need ___ help."',
    '"the"',
    actual,
    actual === 'the'
  )
}

{
  const res = (await post('/api/correct-word', {
    word: 'vaddr',
    contextBefore: 'The',
    contextAfter: 'register stores the virtual address.',
  })) as { corrected: string }
  const actual = res.corrected
  check(
    'Preserves technical identifier "vaddr" unchanged',
    'word="vaddr", context="The ___ register stores the virtual address."',
    '"vaddr"',
    actual,
    actual === 'vaddr'
  )
}

{
  const res = (await post('/api/correct-word', { word: 'recieve' })) as { corrected: string }
  const actual = res.corrected
  check(
    'Corrects "recieve" → "receive" (i before e)',
    'word="recieve", no context',
    '"receive"',
    actual,
    actual === 'receive'
  )
}

console.log('\n\n📌  /api/nl-to-markdown — natural language → markdown\n')

{
  const input = '(checkbox) review pull request'
  const res = (await post('/api/nl-to-markdown', { text: input })) as { markdown: string }
  const actual = res.markdown
  check(
    'Converts checkbox shorthand to GFM task item',
    input,
    'starts with "- [ ]"',
    actual,
    /- \[ \]/.test(actual)
  )
}

{
  const input = 'make this a heading: Virtual Memory'
  const res = (await post('/api/nl-to-markdown', { text: input })) as { markdown: string }
  const actual = res.markdown
  check(
    'Promotes "make this a heading:" to a markdown # heading',
    input,
    'starts with "# Virtual Memory" (any heading level)',
    actual,
    /^#{1,6}\s+Virtual Memory/i.test(actual.trim())
  )
}

{
  const input = 'make a list: apples, bananas, cherries'
  const res = (await post('/api/nl-to-markdown', { text: input })) as { markdown: string }
  const actual = res.markdown
  const lines = actual.split('\n').filter(Boolean)
  check(
    'Converts comma list to bullet points',
    input,
    'each line starts with "- "',
    actual,
    lines.length >= 3 && lines.every((l) => l.startsWith('- '))
  )
}

console.log('\n\n📌  /api/improve-latex — ASCII math → clean LaTeX\n')

{
  const input = 'a/b'
  const res = (await post('/api/improve-latex', { math: input })) as { improved: string }
  const actual = res.improved
  check(
    'Converts "a/b" to \\frac{a}{b}',
    input,
    'contains "\\\\frac"',
    actual,
    /\\frac/.test(actual)
  )
}

{
  const input = 'sqrt(x^2 + y^2)'
  const res = (await post('/api/improve-latex', { math: input })) as { improved: string }
  const actual = res.improved
  check(
    'Converts sqrt(...) to \\sqrt{...}',
    input,
    'contains "\\\\sqrt"',
    actual,
    /\\sqrt/.test(actual)
  )
}

{
  const input = '\\frac{\\partial f}{\\partial x}'
  const res = (await post('/api/improve-latex', { math: input })) as { improved: string }
  const actual = res.improved
  check(
    'Returns valid LaTeX unchanged',
    input,
    'contains "\\\\frac" and "\\\\partial"',
    actual,
    /\\frac/.test(actual) && /\\partial/.test(actual)
  )
}

console.log('\n\n📌  /api/equation-catalog — extract equations from lecture text\n')

{
  const input =
    'The kinetic energy of an object is KE = (1/2) m v^2. ' +
    "Newton's second law states F = ma."
  const res = (await post('/api/equation-catalog', { text: input })) as {
    equations: Array<{ id: string; latex: string; label: string; triggers: string[]; display: boolean }>
  }
  const eqs = res.equations
  check(
    'Extracts at least 1 equation with required fields',
    input,
    'equations[0] has id, latex, label, triggers[], display',
    eqs.length > 0
      ? `${eqs.length} equations — first: id="${eqs[0].id}", label="${eqs[0].label}", latex="${eqs[0].latex}"`
      : '(empty)',
    eqs.length >= 1 &&
      typeof eqs[0].id === 'string' &&
      typeof eqs[0].latex === 'string' &&
      Array.isArray(eqs[0].triggers)
  )
}

console.log('\n\n📌  /api/suggest-equation — match note text to catalog equation\n')

const catalog = [
  {
    id: 'kinetic-energy',
    latex: '\\frac{1}{2} m v^2',
    label: 'Kinetic Energy',
    triggers: ['kinetic energy', 'KE', '1/2 mv^2'],
    display: true,
  },
  {
    id: 'newtons-second',
    latex: 'F = ma',
    label: "Newton's Second Law",
    triggers: ['force', 'F = ma', 'Newton'],
    display: false,
  },
]

{
  const recentText = 'The kinetic energy of the moving ball is given by the standard formula.'
  const res = (await post('/api/suggest-equation', { recentText, equations: catalog })) as {
    match: boolean; id?: string; latex?: string
  }
  check(
    'Matches note about "kinetic energy" to catalog entry',
    recentText,
    'match=true and id="kinetic-energy" (or match=false if model unsure — both OK)',
    res.match ? `match=true, id="${res.id}", latex="${res.latex}"` : 'match=false',
    typeof res.match === 'boolean' && (!res.match || res.id === 'kinetic-energy')
  )
}

{
  const recentText = 'The meeting was rescheduled to Thursday afternoon.'
  const res = (await post('/api/suggest-equation', { recentText, equations: catalog })) as {
    match: boolean
  }
  check(
    'Returns match=false for unrelated note text',
    recentText,
    'match=false',
    `match=${res.match}`,
    res.match === false
  )
}

console.log('\n\n📌  /api/extract-pptx — slide text extraction\n')

{
  const slideText = 'Virtual Memory: page tables map vaddr to paddr. TLB caches translations.'
  const pptxBuf = await createTestPptx(slideText)
  const res = (await postRaw(
    '/api/extract-pptx',
    pptxBuf,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  )) as { text: string }
  const actual = res.text
  check(
    'Extracts text verbatim from a generated PPTX',
    `PPTX slide containing: "${slideText}"`,
    'extracted text contains "page tables" and "TLB"',
    actual,
    /page tables/.test(actual) && /TLB/.test(actual)
  )
}

console.log('\n\n📌  Full pipeline — PPTX → context → autocorrect\n')

{
  const pptxBuf = await createTestPptx(OS_SLIDE_TEXT)
  const extractRes = (await postRaw(
    '/api/extract-pptx',
    pptxBuf,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  )) as { text: string }
  const context = extractRes.text

  const typoNote = 'The vaddr is translatd thorugh the TLB. On a TLB mss, the OS walsk the page tabel.'
  const correctRes = (await post('/api/correct', { text: typoNote, context })) as { corrected: string }
  const corrected = correctRes.corrected

  check(
    'Context-aware autocorrect: fixes typos, keeps vaddr/TLB/paddr',
    `note="${typoNote}" | context=<OS lecture PPTX>`,
    '"translated", "through" fixed; "vaddr" and "TLB" unchanged',
    corrected,
    /vaddr/.test(corrected) && /TLB/.test(corrected) && /translated/i.test(corrected) && /through/i.test(corrected)
  )
}

server.close()
console.log(`\n${'═'.repeat(72)}`)
console.log(`  RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} checks`)
console.log(`${'═'.repeat(72)}\n`)
