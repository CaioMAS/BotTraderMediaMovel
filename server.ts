import express from 'express'
import { startTrading } from './src/services/strategyService'
import { config } from './src/config/dotenv'

const app = express()

app.get('/', (req, res) => {
  res.send('Trading bot is running.')
})

app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`)
  startTrading()
})