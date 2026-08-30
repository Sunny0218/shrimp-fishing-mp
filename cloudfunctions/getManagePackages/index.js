const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const command = db.command
const manageRoles = ['staff', 'admin', 'super_admin']

function fail(code, message) {
  return {
    code,
    message,
    data: null,
  }
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return fail(401, '请先登录后再查看套餐')
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get()
    const user = userRes.data[0]

    if (!user || user.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    if (!manageRoles.includes(user.role)) {
      return fail(403, '无权限查看套餐')
    }

    const packagesRes = await db.collection('packages')
      .where({
        status: command.neq('deleted'),
      })
      .orderBy('sort', 'asc')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get()
    const packages = packagesRes.data.filter(packageItem => packageItem.status !== 'deleted')

    return {
      code: 0,
      message: 'ok',
      data: {
        rows: packages,
        total: packages.length,
        canEdit: user.role === 'super_admin',
        canToggleStatus: ['admin', 'super_admin'].includes(user.role),
        serverTime: new Date().toISOString(),
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '套餐获取失败')
  }
}
