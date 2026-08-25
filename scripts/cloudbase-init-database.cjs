const fs = require('node:fs')
const path = require('node:path')
const { v20180608 } = require('tencentcloud-sdk-nodejs/tencentcloud/services/tcb/v20180608')

const projectRoot = path.resolve(__dirname, '..')
const collectionsConfigPath = path.resolve(projectRoot, 'cloudbase/database/collections.json')
const envFilePath = path.resolve(projectRoot, 'env/.env')

function readEnvValue(filePath, key) {
  if (!fs.existsSync(filePath)) {
    return ''
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const line = content
    .split(/\r?\n/)
    .map(item => item.trim())
    .find(item => item.startsWith(`${key} =`) || item.startsWith(`${key}=`))

  if (!line) {
    return ''
  }

  const [, rawValue = ''] = line.split(/=(.*)/s)
  return rawValue.trim().replace(/^['"]|['"]$/g, '')
}

function getRequiredEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`)
  }
  return value
}

function isAlreadyExistsError(error) {
  const message = error && error.message ? error.message : String(error)
  const code = error && (error.code || error.errCode)

  return (
    code === 'ResourceInUse'
    || code === 'ResourceInUse.Table'
    || code === 'InvalidParameter.CollectionAlreadyExists'
    || message.includes('already exists')
    || message.includes('exist')
    || message.includes('同名')
    || message.includes('已存在')
  )
}

async function createTable(client, envId, collectionName) {
  try {
    await client.CreateTable({
      EnvId: envId,
      TableName: collectionName,
      PermissionInfo: {
        EnvId: envId,
        AclTag: 'ADMINONLY',
      },
    })

    return 'created'
  }
  catch (error) {
    if (isAlreadyExistsError(error)) {
      return 'exists'
    }

    throw error
  }
}

async function setAdminOnlyAcl(client, envId, collectionName) {
  await client.ModifyDatabaseACL({
    EnvId: envId,
    CollectionName: collectionName,
    AclTag: 'ADMINONLY',
  })
}

async function main() {
  const envId = process.env.TCB_ENV_ID || readEnvValue(envFilePath, 'VITE_WX_CLOUD_ENV_ID')
  if (!envId) {
    throw new Error('缺少云环境 ID，请配置 TCB_ENV_ID 或 env/.env 中的 VITE_WX_CLOUD_ENV_ID')
  }

  const secretId = getRequiredEnv('TENCENTCLOUD_SECRET_ID')
  const secretKey = getRequiredEnv('TENCENTCLOUD_SECRET_KEY')
  const region = process.env.TENCENTCLOUD_REGION || 'ap-shanghai'

  const config = JSON.parse(fs.readFileSync(collectionsConfigPath, 'utf8'))
  const collections = Array.isArray(config.collections) ? config.collections : []

  const client = new v20180608.Client({
    credential: {
      secretId,
      secretKey,
    },
    region,
    profile: {
      httpProfile: {
        endpoint: 'tcb.tencentcloudapi.com',
      },
    },
  })

  console.log(`CloudBase EnvId: ${envId}`)
  console.log(`Region: ${region}`)
  console.log(`Collections: ${collections.length}`)

  const results = []

  for (const collection of collections) {
    const name = collection.name
    const createStatus = await createTable(client, envId, name)
    await setAdminOnlyAcl(client, envId, name)

    const result = {
      name,
      createStatus,
      acl: 'ADMINONLY',
    }
    results.push(result)
    console.log(`${name}: ${createStatus}, acl=ADMINONLY`)
  }

  console.log('')
  console.log(JSON.stringify({ code: 0, envId, results }, null, 2))
}

main().catch((error) => {
  console.error('')
  console.error('初始化云数据库失败：')
  console.error(error && error.message ? error.message : error)
  console.error('')
  console.error('请确认已在当前终端设置：')
  console.error('  export TENCENTCLOUD_SECRET_ID=你的SecretId')
  console.error('  export TENCENTCLOUD_SECRET_KEY=你的SecretKey')
  console.error('可选：')
  console.error('  export TENCENTCLOUD_REGION=ap-shanghai')
  console.error('  export TCB_ENV_ID=cloud1-d0g78pgvq20122192')
  process.exit(1)
})
