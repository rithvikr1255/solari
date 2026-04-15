import { createApp } from './app.js'

const app = createApp()
const port = process.env.PORT ?? 3001

app.listen(port, () => {
  console.log(`Solari server running on http://localhost:${port}`)
})
