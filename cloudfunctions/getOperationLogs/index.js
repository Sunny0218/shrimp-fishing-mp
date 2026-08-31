const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const { manageRoles } = require('../common/roles')

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

function normalizePositiveInteger(value, fallback) {
  const numberValue = Number(value)

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return fallback
  }

  return Math.floor(numberValue)
}

function normalizeLog(log) {
  return {
    _id: log._id,
    orderId: log.orderId || '',
    orderNo: log.orderNo || '',
    action: log.action || '',
    actionText: log.actionText || log.action || '',
    operatorType: log.operatorType || '',
    operatorUserId: log.operatorUserId || '',
    operatorOpenid: log.operatorOpenid || '',
    operatorRole: log.operatorRole || '',
    operatorName: log.operatorName || log.operatorOpenid || '',
    payload: log.payload || {},
    createdAt: log.createdAt || null,
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const orderId = normalizeString(event.orderId)
  const limit = Math.min(normalizePositiveInteger(event.limit, 50), 50)

  if (!openid) {
    return fail(401, '请先登录后再查看操作记录')
  }

  if (!orderId) {
    return fail(400, '缺少订单 ID')
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get()
    const user = userRes.data[0]

    if (!user || user.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    if (!manageRoles.includes(user.role)) {
      return fail(403, '无权限查看操作记录')
    }

    const logsRes = await db.collection('operation_logs')
      .where({ orderId })
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get()
      .catch(() => ({ data: [] }))
    const rows = logsRes.data.map(normalizeLog)

    return {
      code: 0,
      message: 'ok',
      data: {
        rows,
        total: rows.length,
        serverTime: new Date().toISOString(),
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '操作记录获取失败')
  }
}
