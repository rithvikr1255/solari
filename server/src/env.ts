import { config } from 'dotenv'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const dir = dirname(fileURLToPath(import.meta.url))
config({ path: join(dir, '../.env') })
