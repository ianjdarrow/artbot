require('dotenv').config()
const deburr = require('lodash.deburr')
const Web3 = require('web3')
const ProjectBot = require('./ProjectBot').ProjectBot
const getArtBlocksProjects =
  require('../Utils/parseArtBlocksAPI').getArtBlocksProjects
const getArtBlocksOpenProjects =
  require('../Utils/parseArtBlocksAPI').getArtBlocksOpenProjects
const getProjectsBirthdays =
  require('../Utils/parseArtBlocksAPI').getProjectsBirthdays

const web3 = new Web3(Web3.givenProvider || 'ws://localhost:8545')

// Refresh takes around one minute, so recommend setting this to 60 minutes
const METADATA_REFRESH_INTERVAL_MINUTES =
  process.env.METADATA_REFRESH_INTERVAL_MINUTES

// RandomBot Stuff
const RANDOM_ART_AMOUNT = 10
// Time for random art (UTC) - 8am EST
const RANDOM_ART_TIME = new Date()
RANDOM_ART_TIME.setHours(12)
RANDOM_ART_TIME.setMinutes(0)
RANDOM_ART_TIME.setSeconds(0)
RANDOM_ART_TIME.setMilliseconds(0)

// Time for birthday check (UTC) - 10am EST
const BIRTHDAY_CHECK_TIME = new Date()
BIRTHDAY_CHECK_TIME.setHours(14)
BIRTHDAY_CHECK_TIME.setMinutes(0)
BIRTHDAY_CHECK_TIME.setSeconds(0)
BIRTHDAY_CHECK_TIME.setMilliseconds(0)

class ArtIndexerBot {
  constructor(projectFetch = getArtBlocksProjects) {
    this.projectFetch = projectFetch
    this.projects = {}
    this.birthdays = {}
    this.init()
  }

  /**
   * Initialize async aspects of the FactoryBot
   */
  async init() {
    await this.buildProjectBots()

    setInterval(async () => {
      await this.buildProjectBots()
    }, METADATA_REFRESH_INTERVAL_MINUTES * 60000)
  }

  async buildProjectBots() {
    try {
      const projects = await this.projectFetch()
      const bdays = await getProjectsBirthdays()
      for (let i = 0; i < projects.length; i++) {
        const project = projects[i]
        console.log(
          `Refreshing project cache for Project ${project.projectId} ${project.name}`
        )
        let bday = bdays[`${project.contract.id}-${project.projectId}`]
        const newBot = new ProjectBot({
          projectNumber: project.projectId,
          coreContract: project.contract.id,
          editionSize: project.invocations,
          projectName: project.name,
          projectActive: project.active,
          startTime: bday ? new Date(bday) : null,
        })
        const projectKey = this.toProjectKey(project.name)
        this.projects[projectKey] = newBot
        if (bday) {
          const [year, month, day] = bday.split('T')[0].split('-')
          bday = month + '-' + day
          this.birthdays[bday] = this.birthdays[bday] ?? []
          this.birthdays[bday].push(newBot)
        }
      }
    } catch (err) {
      console.error(`Error while initializing ArtIndexerBots\n${err}`)
    }
  }

  async handleNumberMessage(msg) {
    const content = msg.content

    if (content.length <= 1) {
      msg.channel.send(
        `Invalid format, enter # followed by the piece number of interest.`
      )
      return
    }

    let projectKey = this.toProjectKey(
      content.substr(content.indexOf(' ') + 1).replace('?details', '')
    )

    // if '#?' message, get random project
    if (projectKey === '#?') {
      return this.sendRandomProjectRandomTokenMessage(msg, 1)
    } else if (projectKey === 'open') {
      return this.sendRandomOpenProjectRandomTokenMessage(msg)
    }

    console.log(`Searching for project ${projectKey}`)
    const projBot = this.projects[projectKey]
    // TODO: handle PBAB projects (e.g. #? Plottables)
    if (projBot) {
      projBot.handleNumberMessage(msg)
    }
  }

  toProjectKey(projectName) {
    const projectKey = deburr(projectName)
      .toLowerCase()
      .replace(/[^a-z0-9]/gi, '')

    // just in case there's a project name with no alphanumerical characters
    if (projectKey === '') {
      return deburr(projectName).toLowerCase().replace(/\s+/g, '')
    }

    return projectKey
  }

  async startRandomRoutine(channel) {
    let msg = {}
    msg.content = '#?'
    msg.channel = channel
    // Try to message(s) in #ab-art-chat every minute
    setInterval(() => {
      let now = new Date()
      // Only send message if hour and minute match up with specified time
      if (
        now.getHours() !== RANDOM_ART_TIME.getHours() ||
        now.getMinutes() !== RANDOM_ART_TIME.getMinutes()
      ) {
        return
      }
      this.sendRandomProjectRandomTokenMessage(msg, RANDOM_ART_AMOUNT)
    }, 1 * 60000)
  }

  async startBirthdayRoutine(channels, projectConfig) {
    setInterval(() => {
      let now = new Date()
      // Only send message if hour and minute match up with specified time
      if (
        now.getHours() !== BIRTHDAY_CHECK_TIME.getHours() ||
        now.getMinutes() !== BIRTHDAY_CHECK_TIME.getMinutes()
      ) {
        return
      }
      const [year, month, day] = now.toISOString().split('T')[0].split('-')
      if (this.birthdays[`${month}-${day}`]) {
        this.birthdays[`${month}-${day}`].forEach((projBot) => {
          if (
            projBot.startTime &&
            projBot.startTime.getFullYear().toString() !== year
          ) {
            projBot.sendBirthdayMessage(channels, projectConfig)
          }
        })
      }
    }, 1 * 60000)
  }

  // This function takes a channel and sends a message containing a random
  // token from a random project
  async sendRandomProjectRandomTokenMessage(msg, numMessages) {
    let attempts = 0
    while (attempts < 10) {
      const keys = Object.keys(this.projects)
      let projectKey = keys[Math.floor(Math.random() * keys.length)]
      let projBot = this.projects[projectKey]
      if (projBot && projBot.editionSize > 1 && projBot.projectActive) {
        for (let i = 0; i < numMessages; i++) {
          projBot.handleNumberMessage(msg)
        }
        return
      }
      attempts++
    }
  }

  // This function takes a channel and sends a message containing a random
  // token from a random open project
  async sendRandomOpenProjectRandomTokenMessage(msg) {
    let attempts = 0
    while (attempts < 10) {
      const openProjects = await getArtBlocksOpenProjects()

      let project =
        openProjects[Math.floor(Math.random() * openProjects.length)]

      let projBot = this.projects[this.toProjectKey(project.name)]
      if (projBot && projBot.editionSize > 1 && projBot.projectActive) {
        return projBot.handleNumberMessage(msg)
      }
      attempts++
    }
  }
}

module.exports.ArtIndexerBot = ArtIndexerBot
