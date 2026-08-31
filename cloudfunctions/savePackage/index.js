const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const { shopEditRoles } = require('../common/roles')
const validStatuses = ['active', 'disabled']

function fail(code, message) {
  return {
    code,
    message,
    data: null,
  }
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeInteger(value, fallback = 0) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.max(Math.floor(number), 0)
}

function normalizePackage(event) {
  const name = normalizeString(event.name)
  const description = normalizeString(event.description)
  const status = validStatuses.includes(event.status) ? event.status : 'active'
  const durationMinutes = normalizeInteger(event.durationMinutes)
  const price = normalizeInteger(event.price)
  const rodCount = normalizeInteger(event.rodCount, 1)
  const maxPeople = normalizeInteger(event.maxPeople, rodCount)
  const sort = normalizeInteger(event.sort)

  if (!name) {
    return { error: '请填写套餐名称' }
  }

  if (durationMinutes <= 0) {
    return { error: '请填写有效套餐时长' }
  }

  if (price <= 0) {
    return { error: '请填写有效套餐价格' }
  }

  if (rodCount <= 0) {
    return { error: '请填写有效杆数' }
  }

  if (maxPeople <= 0) {
    return { error: '请填写有效建议人数' }
  }

  return {
    data: {
      name,
      description,
      durationMinutes,
      price,
      rodCount,
      maxPeople,
      status,
      sort,
    },
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const packageId = normalizeString(event.packageId)

  if (!openid) {
    return fail(401, '请先登录后再保存套餐')
  }

  const normalized = normalizePackage(event)

  if (normalized.error) {
    return fail(400, normalized.error)
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get()
    const user = userRes.data[0]

    if (!user || user.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    if (!shopEditRoles.includes(user.role)) {
      return fail(403, '无权限保存套餐')
    }

    const now = new Date()

    if (packageId) {
      await db.collection('packages').doc(packageId).update({
        data: {
          ...normalized.data,
          updatedAt: now,
          updatedBy: openid,
        },
      })

      const packageRes = await db.collection('packages').doc(packageId).get()

      return {
        code: 0,
        message: 'ok',
        data: {
          package: packageRes.data,
        },
      }
    }

    const addRes = await db.collection('packages').add({
      data: {
        ...normalized.data,
        createdAt: now,
        createdBy: openid,
        updatedAt: now,
        updatedBy: openid,
      },
    })
    const packageRes = await db.collection('packages').doc(addRes._id).get()

    return {
      code: 0,
      message: 'ok',
      data: {
        package: packageRes.data,
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '套餐保存失败')
  }
}
