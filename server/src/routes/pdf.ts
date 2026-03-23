import { Router } from 'express'
import express from 'express'
import { PDFParse } from 'pdf-parse'

export const pdfRouter = Router()

const MAX_TEXT = 45000

pdfRouter.post(
  '/extract-pdf',
  express.raw({ type: 'application/pdf', limit: '15mb' }),
  async (req, res) => {
    const buf = req.body as Buffer
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      res.status(400).json({ error: 'expected application/pdf body' })
      return
    }
    let parser: PDFParse | undefined
    try {
      parser = new PDFParse({ data: new Uint8Array(buf) })
      const data = await parser.getText()
      const text = (data.text ?? '').trim().slice(0, MAX_TEXT)
      if (!text) {
        res.status(400).json({ error: 'no text extracted' })
        return
      }
      res.json({ text })
    } catch {
      res.status(400).json({ error: 'could not read pdf' })
    } finally {
      if (parser) await parser.destroy().catch(() => {})
    }
  }
)
