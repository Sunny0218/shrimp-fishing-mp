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

async function disableOtherActiveRules(pricingRuleId, now, openid) {
  const activeRes = await db.collection('pricing_rules').where({ status: 'active' }).limit(100).get()
  const tasks = activeRes.data
    .filter(rule => rule._id !== pricingRuleId)
    .map(rule => db.collection('pricing_rules').doc(rule._id).update({
      data: {
        status: 'disabled',
        updatedAt: now,
        updatedBy: openid,
      },
    }))

  await Promise.all(tasks)
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const pricingRuleId = normalizeString(event.pricingRuleId)
  const status = normalizeString(event.status)

  if (!openid) {
    return fail(401, '请先登录后再调整计费规则')
  }

  if (!pricingRuleId) {
    return fail(400, '缺少计费规则 ID')
  }

  if (!validStatuses.includes(status)) {
    return fail(400, '计费规则状态不正确')
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get()
    const user = userRes.data[0]

    if (!user || user.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    if (!editRoles.includes(user.role)) {
      return fail(403, '无权限调整计费规则')
    }

    const now = new Date()

    if (status === 'active') {
      await disableOtherActiveRules(pricingRuleId, now, openid)
    }

    await db.collection('pricing_rules').doc(pricingRuleId).update({
      data: {
        status,
        updatedAt: now,
        updatedBy: openid,
      },
    })

    const ruleRes = await db.collection('pricing_rules').doc(pricingRuleId).get()

    return {
      code: 0,
      message: 'ok',
      data: {
        pricingRule: ruleRes.data,
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '计费规则状态调整失败')
  }
}
