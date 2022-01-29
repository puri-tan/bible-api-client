const axios = require('axios')
const http = require('http')
const https = require('https')
const booksByAbbrev = require('./bible-books-by-abbrev')
const booksByName = require('./bible-books-by-name')
const bookChapters = require('./bible-book-chapters')
const { formatRegex } = require('./regex-formatter')
const { formatString } = require('./string-formatter')

module.exports = class BibleApiClient {
  #defaultVersion = 'acf'

  #client = null
  #versesRegex = null
  #bookMatches = {}

  constructor(config) {
    this.#defaultVersion = config.defaultVersion

    const httpAgent = new http.Agent({ keepAlive: true })
    const httpsAgent = new https.Agent({ keepAlive: true })

    const defaultHeaders = {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/json'
    }

    this.#client = axios.create({
      httpAgent: httpAgent,
      httpsAgent: httpsAgent,
      baseURL: config.baseURL,
      headers: defaultHeaders
    })

    for (const bookName in booksByName) {
      const formattedName = formatString(bookName)
      this.#bookMatches[formattedName] = booksByName[bookName]
    }

    const beginRegex = '(^|\\s|,|;)'
    const bookNameRegex = formatRegex(Object.keys(booksByName).join('|'))
    const booksRegex = '(?<BookName>' + bookNameRegex + ')'
    const chapterRegex = '\\s+(?<Chapter>\\d+)(\\s*(:|.)\\s*(?<FromVerse>\\d+)(\\s*-\\s*(?<ToVerse>\\d+))?)?'
    const versionRegex = '(\\s+(?<VersionName>acf|apee|bbe|kjv|nvi|ra|rvr))?'
    const terminatorRegex = '($|\\s+)'
    const versesRegex =  beginRegex + booksRegex + chapterRegex + versionRegex + terminatorRegex

    this.#versesRegex = new RegExp(versesRegex, 'gim')
  }

  async #callUrl(url) {
    try {
      const response = await this.#client.get(url, { validateStatus: false })

      if (response.status == 404) {
        console.log(`404 Not Found on Bible API at endpoint "${url}".`)
        return { error: 'NotFound' }
      }

      if (response.status != 200) {
        console.log(`Error ${response.status} calling Bible API at endpoint "${url}".`)
        return { error: 'UnexpectedResponse' }
      }

      return response.data
    }
    catch (error) {
      console.log(`Unexpected error when calling Bible API at endpoint "${url}". ${error}`)
      return { error: 'Failure' }
    }
  }

  #chooseVersion(version) {
    function isEmptyOrSpaces(str) {
      return str === undefined || str === null || str.match(/^ *$/) !== null;
    }
    return isEmptyOrSpaces(version) ? this.#defaultVersion : version
  }

  async #findChapter(bookAbbrev, chapter, version) {
    const choosenVersion = this.#chooseVersion(version)
    const url = `/verses/${choosenVersion}/${bookAbbrev}/${chapter}`
    return await this.#callUrl(url)
  }

  async #findVerse(bookAbbrev, chapter, verse, version) {
    const choosenVersion = this.#chooseVersion(version)
    const url = `/verses/${choosenVersion}/${bookAbbrev}/${chapter}/${verse}`
    return await this.#callUrl(url)
  }

  async #findVersesFromGroup(group, version) {
    const formattedName = formatString(group.BookName)
    const bookAbbrev = this.#bookMatches[formattedName]
    const bookChapterCount = bookChapters[bookAbbrev]

    const result = {
      bookName: booksByAbbrev[bookAbbrev],
      chapter: parseInt(group.Chapter),
      fromVerse: parseInt(group.FromVerse),
      toVerse: parseInt(group.ToVerse),
      verses: []
    }

    if (result.chapter >= 1 && result.chapter <= bookChapterCount) {
      if (result.fromVerse && result.toVerse) {
        if (result.fromVerse >= 1 && result.toVerse >= 1 && result.fromVerse <= result.toVerse) {
          for (var verse = result.fromVerse; verse <= result.toVerse; verse++) {
            const response = await this.#findVerse(bookAbbrev, result.chapter, verse, version)
            if (response.error) {
              result.error = response.error
              return result
            } else {
              result.verses.push({ number: response.number, text: response.text })
            }
          }
        }
      } else if (result.fromVerse) {
        if (result.fromVerse >= 1) {
          const response = await this.#findVerse(bookAbbrev, result.chapter, result.fromVerse, version)
          if (response.error) {
            result.error = response.error
          } else {
            result.verses.push({ number: response.number, text: response.text })
          }
        }
      }
      else {
        const response = await this.#findChapter(bookAbbrev, result.chapter, version)
        for (var verse of response.verses) {
          if (response.error) {
            result.error = response.error
          } else {
            result.verses.push({ number: verse.number, text: verse.text })
          }
        }
      }
    } else {
      result.error = 'InvalidChapter'
    }

    return result
  }

  matchVersesFromMessage(message) {
    return [...message.matchAll(this.#versesRegex)].map(x => x.groups)
  }

  async pullVersesFromMatch(groups, version) {
    const responses = []

    for (const group of groups) {
      const response = await this.#findVersesFromGroup(group, version)
      responses.push(response)
    }

    return responses
  }
}
