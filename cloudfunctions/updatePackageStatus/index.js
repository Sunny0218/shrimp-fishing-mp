const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const editRoles = ['admin', 'super_admin']
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

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const packageId = normalizeString(event.packageId)
  const status = normalizeString(event.status)

  if (!openid) {
    return fail(401, '请先登录后再调整套餐')
  }

  if (!packageId) {
    return fail(400, '缺少套餐 ID')
  }

  if (!validStatuses.includes(status)) {
    return fail(400, '套餐状态不正确')
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get()
    const user = userRes.data[0]

    if (!user || user.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    if (!editRoles.includes(user.role)) {
      return fail(403, '无权限调整套餐')
    }

    await db.collection('packages').doc(packageId).update({
      data: {
        status,
        updatedAt: new Date(),
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
  catch (error) {
    return fail(500, error.message || '套餐状态调整失败')
  }
}
