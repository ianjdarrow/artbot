const ethers = require('ethers')
const fetch = require('node-fetch')

let provider = new ethers.providers.AlchemyProvider('homestead')

// Runtime ENS cache just to limit queries
let ensAddressMap = {}
let osAddressMap = {}

async function getENSName(address) {
  let name = ''
  if (ensAddressMap[address]) {
    name = ensAddressMap[address]
  } else {
    let ens = await provider.lookupAddress(address)
    name = ens ?? ''
    ensAddressMap[address] = name
  }
  return name
}

async function ensOrAddress(address) {
  let ens = await getENSName(address)
  return ens !== '' ? ens : address
}

async function getOSName(address) {
  let name = ''
  if (osAddressMap[address]) {
    console.log('Cached!')
    name = osAddressMap[address]
  } else {
    try {
      let response = await fetch(`https://api.opensea.io/user/${address}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-API-KEY': process.env.OPENSEA_API_KEY,
        },
      })
      let responseBody = await response.json()
      if (responseBody.detail) {
        throw new Error(responseBody.detail)
      }
      name = responseBody.username ?? ''
      osAddressMap[address] = name
    } catch (err) {
      // Probably rate limited - return empty sting but don't cache
      name = ''
      console.log(err)
    }
  }

  return name
}

module.exports.ensOrAddress = ensOrAddress
module.exports.getOSName = getOSName
