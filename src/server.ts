import mongoose from 'mongoose'
import { app } from './app.js'
import { env } from './config/env.js'

try {
  await mongoose.connect(env.MONGODB_URI)
  app.listen(env.PORT, () => {
    console.info(`A Z Studios API listening on port ${env.PORT}`)
  })
} catch (error) {
  console.error('Could not start API:', error)
  process.exit(1)
}
