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

function normalizeInteger(value, fallback = 0) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.max(Math.floor(number), 0)
}

function normalizeRule(event) {
  const name = normalizeString(event.name)
  const description = normalizeString(event.description)
  const pricePerHour = normalizeInteger(event.pricePerHour)
  const firstHourAmount = normalizeInteger(event.firstHourAmount)
  const extraPricePerHour = normalizeInteger(event.extraPricePerHour || event.pricePerHour)
  const minimumMinutes = normalizeInteger(event.minimumMinutes)
  const unitMinutes = normalizeInteger(event.unitMinutes)
  const sort = normalizeInteger(event.sort)
  const status = validStatuses.includes(event.status) ? event.status : 'active'

  if (!name) {
    return { error: '请填写规则名称' }
  }

  if (firstHourAmount <= 0) {
    return { error: '请填写有效首小时价格' }
  }

  if (extraPricePerHour <= 0) {
    return { error: '请填写有效续钟每小时价' }
  }

  if (minimumMinutes <= 0) {
    return { error: '请填写有效最低计费分钟' }
  }

  if (unitMinutes <= 0) {
    return { error: '请填写有效计费粒度' }
  }

  return {
    data: {
      name,
      description,
      pricePerHour: pricePerHour > 0 ? pricePerHour : firstHourAmount,
      firstHourAmount,
      extraPricePerHour,
      minimumMinutes,
      unitMinutes,
      status,
      sort,
    },
  }
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

  if (!openid) {
    return fail(401, '请先登录后再保存计费规则')
  }

  const normalized = normalizeRule(event)

  if (normalized.error) {
    return fail(400, normalized.error)
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get()
    const user = userRes.data[0]

    if (!user || user.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    if (!editRoles.includes(user.role)) {
      return fail(403, '无权限保存计费规则')
    }

    const now = new Date()

    if (pricingRuleId) {
      if (normalized.data.status === 'active') {
        await disableOtherActiveRules(pricingRuleId, now, openid)
      }

      await db.collection('pricing_rules').doc(pricingRuleId).update({
        data: {
          ...normalized.data,
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

    if (normalized.data.status === 'active') {
      await disableOtherActiveRules('', now, openid)
    }

    const addRes = await db.collection('pricing_rules').add({
      data: {
        ...normalized.data,
        createdAt: now,
        createdBy: openid,
        updatedAt: now,
        updatedBy: openid,
      },
    })
    const ruleRes = await db.collection('pricing_rules').doc(addRes._id).get()

    return {
      code: 0,
      message: 'ok',
      data: {
        pricingRule: ruleRes.data,
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '计费规则保存失败')
  }
}
