import { Router } from 'express'
import express from 'express'
import JSZip from 'jszip'

export const pptxRouter = Router()

const MAX_TEXT = 45000

function decodeXmlEntities(s: string): string {
  return s
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
}

function extractAText(xml: string): string {
  const withBreaks = xml.replace(/<\/a:p>/gi, '\n').replace(/<\/p>/gi, '\n')
  const parts: string[] = []
  const re = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(withBreaks)) !== null) {
    const chunk = decodeXmlEntities(m[1].replace(/\s+/g, ' ').trim())
    if (chunk) parts.push(chunk)
  }
  return parts.join(' ')
}

function sortSlidePaths(a: string, b: string): number {
  const na = a.match(/(?:^|\/)(?:slide|notesSlide)(\d+)\.xml$/i)
  const nb = b.match(/(?:^|\/)(?:slide|notesSlide)(\d+)\.xml$/i)
  const da = na ? parseInt(na[1], 10) : 0
  const db = nb ? parseInt(nb[1], 10) : 0
  if (da !== db) return da - db
  const slideFirst = (p: string) => (/\/slides\/slide\d+\.xml$/i.test(p) ? 0 : 1)
  return slideFirst(a) - slideFirst(b)
}

pptxRouter.post(
  '/extract-pptx',
  express.raw({
    type: (req) => {
      const ct = (req.headers['content-type'] || '').toLowerCase()
      return (
        ct.includes('presentationml.presentation') ||
        ct.includes('application/zip') ||
        ct.includes('application/octet-stream')
      )
    },
    limit: '15mb'
  }),
  async (req, res) => {
    const buf = req.body as Buffer
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      res.status(400).json({ error: 'expected pptx body' })
      return
    }
    try {
      const zip = await JSZip.loadAsync(buf)
      const names = Object.keys(zip.files).filter(
        (n) =>
          /^ppt\/slides\/slide\d+\.xml$/i.test(n) ||
          /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(n)
      )
      if (names.length === 0) {
        res.status(400).json({ error: 'not a pptx or no slides' })
        return
      }
      names.sort(sortSlidePaths)
      const chunks: string[] = []
      for (const name of names) {
        const entry = zip.files[name]
        if (!entry || entry.dir) continue
        const xml = await entry.async('string')
        const t = extractAText(xml).trim()
        if (t) chunks.push(t)
      }
      const text = chunks.join('\n\n').trim().slice(0, MAX_TEXT)
      if (!text) {
        res.status(400).json({ error: 'no text extracted' })
        return
      }
      res.json({ text })
    } catch {
      res.status(400).json({ error: 'could not read pptx' })
    }
  }
)
