import JSZip from 'jszip'

export async function createTestPptx(slideText: string): Promise<Buffer> {
  const safe = slideText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      <a:bodyPr/><a:lstStyle/>
      <a:p><a:r><a:t>${safe}</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`

  const zip = new JSZip()
  zip.file('ppt/slides/slide1.xml', slideXml)
  return zip.generateAsync({ type: 'nodebuffer' })
}

// Builds a valid PDF by tracking byte offsets incrementally so the xref table
// points to the correct object positions — required for pdf-parse to read it.
export function createTestPdf(text: string): Buffer {
  const chunks: string[] = []
  const offsets: number[] = new Array(6).fill(0)
  let pos = 0

  function push(s: string): void {
    chunks.push(s)
    pos += Buffer.byteLength(s, 'latin1')
  }

  push('%PDF-1.4\n')

  offsets[1] = pos
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n\n')

  offsets[2] = pos
  push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n\n')

  offsets[3] = pos
  push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]' +
      ' /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n\n'
  )

  // Escape PDF string special chars
  const safeText = text.replace(/[()\\]/g, '\\$&')
  const stream = `BT /F1 12 Tf 100 700 Td (${safeText}) Tj ET\n`
  offsets[4] = pos
  push(
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}endstream\nendobj\n\n`
  )

  offsets[5] = pos
  push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n\n')

  const xrefStart = pos
  push('xref\n0 6\n')
  push('0000000000 65535 f \n')
  for (let i = 1; i <= 5; i++) {
    push(offsets[i].toString().padStart(10, '0') + ' 00000 n \n')
  }
  push(`\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`)

  return Buffer.from(chunks.join(''), 'latin1')
}

export const OS_SLIDE_TEXT =
  'Virtual Memory: Each process sees its own address space. ' +
  'The OS uses page tables to translate virtual addresses (vaddr) to physical addresses (paddr). ' +
  'Average turnaround time T_avg = (T1 + T2 + ... + Tn) / n. ' +
  'TLB (Translation Lookaside Buffer) caches recent translations. ' +
  'Page fault occurs when a requested page is not in physical memory.'
