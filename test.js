const BibleApiClient = require('./lib/bible-api-client')
const dotenv = require('dotenv')

const message = "Joao 1:1-3 kjv"

dotenv.config()

const config = {
  baseURL: process.env.BIBLE_API_URL,
  token: process.env.BIBLE_API_TOKEN,
  defaultVersion: process.env.BIBLE_DEFAULT_VERSION
}

const client = new BibleApiClient(config)
const groups = client.matchVersesFromMessage(message)

client.pullVersesFromMatch(groups).then(matches => {
  matches.forEach(match => {
    match.verses.forEach(verse => {
      console.log(verse.text)
    })
  })
})
