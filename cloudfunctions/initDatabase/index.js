const cloud = require('wx-server-sdk')
const collectionsConfig = require('./collections.json')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()

async function createCollectionIfNeeded(name) {
  try {
    await db.createCollection(name)
    return {
      name,
      status: 'created',
    }
  }
  catch (error) {
    const message = error && error.message ? error.message : String(error)
    const code = error && error.errCode ? error.errCode : error && error.code

    if (
      code === -502005
      || code === 'DATABASE_COLLECTION_ALREADY_EXISTS'
      || message.includes('already exists')
      || message.includes('collection exists')
      || message.includes('同名集合')
    ) {
      return {
        name,
        status: 'exists',
      }
    }

    return {
      name,
      status: 'failed',
      message,
      code,
    }
  }
}

exports.main = async () => {
  const collections = collectionsConfig.collections || []
  const results = []

  for (const collection of collections) {
    results.push(await createCollectionIfNeeded(collection.name))
  }

  return {
    code: 0,
    message: 'ok',
    data: {
      results,
    },
  }
}
