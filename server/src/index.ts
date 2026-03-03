import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { llmRouter } from './routes/llm.js'

const app = express()
const port = process.env.PORT ?? 3001

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }))
app.use(express.json())
app.use('/api', llmRouter)

app.listen(port, () => {
  console.log(`Solari server running on http://localhost:${port}`)
})
