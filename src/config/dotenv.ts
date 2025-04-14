import dotenv from 'dotenv'

dotenv.config()

export const config = {
  STREAM_URL: process.env.STREAM_URL || '',
  SYMBOL: process.env.SYMBOL || '',
  API_URL: process.env.API_URL || '',
  API_KEY: process.env.API_KEY || '',
  SECRET_KEY: process.env.SECRET_KEY || '',
  PORT: process.env.PORT || 3000,
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN || '',
  CHAT_ID: process.env.CHAT_ID || '',
}
