import './env.js'
import express from 'express'
import cors from 'cors'
import { llmRouter } from './routes/llm.js'
import { pdfRouter } from './routes/pdf.js'
import { pptxRouter } from './routes/pptx.js'

const viteOrigins = [5173, 5174, 5175, 5176, 5177, 5178, 5179].map(
  (p) => `http://localhost:${p}`
)

export function createApp() {
  const app = express()
  app.use(cors({ origin: [...viteOrigins, 'http://localhost:4173'] }))
  app.use(express.json())
  app.use('/api', pdfRouter)
  app.use('/api', pptxRouter)
  app.use('/api', llmRouter)
  return app
}
