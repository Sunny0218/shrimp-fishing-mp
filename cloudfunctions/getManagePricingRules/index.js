const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const command = db.command
const { manageRoles, statusToggleRoles, shopEditRoles } = require('../common/roles')

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
    return fail(401, '请先登录后再查看计费规则')
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get()
    const user = userRes.data[0]

    if (!user || user.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    if (!manageRoles.includes(user.role)) {
      return fail(403, '无权限查看计费规则')
    }

    const ruleRes = await db.collection('pricing_rules')
      .where({
        status: command.neq('deleted'),
      })
      .orderBy('sort', 'asc')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get()
    const rows = ruleRes.data.filter(rule => rule.status !== 'deleted')

    return {
      code: 0,
      message: 'ok',
      data: {
        rows,
        total: rows.length,
        canEdit: shopEditRoles.includes(user.role),
        canToggleStatus: statusToggleRoles.includes(user.role),
        serverTime: new Date().toISOString(),
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '计费规则获取失败')
  }
}
