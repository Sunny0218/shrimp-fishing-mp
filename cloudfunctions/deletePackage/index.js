const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const editRoles = ['admin', 'super_admin']

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

  if (!openid) {
    return fail(401, '请先登录后再删除套餐')
  }

  if (!packageId) {
    return fail(400, '缺少套餐 ID')
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get()
    const user = userRes.data[0]

    if (!user || user.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    if (!editRoles.includes(user.role)) {
      return fail(403, '无权限删除套餐')
    }

    await db.collection('packages').doc(packageId).update({
      data: {
        status: 'deleted',
        deletedAt: new Date(),
        deletedBy: openid,
        updatedAt: new Date(),
        updatedBy: openid,
      },
    })

    return {
      code: 0,
      message: 'ok',
      data: {
        packageId,
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '套餐删除失败')
  }
}
