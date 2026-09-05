const cloud = require('wx-server-sdk')
const { manageRoles } = require('../common/roles')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const validTargets = ['customer', 'staff']
const validStatuses = ['accept', 'reject', 'ban', 'filter']
const validEventTypes = [
  'customer_paid',
  'customer_started',
  'customer_ended',
  'customer_pending_checkout',
  'customer_completed',
  'customer_refunded',
]
const notificationTemplateConfig = {
  reservationNotice: {
    templateId: '8O7iDjllM5Yi1TBFTaxwwubW9kuNbr77rtbOQnjeaSc',
    title: '预约通知',
  },
  orderStatus: {
    templateId: 'swMnYem-qmhfPYmL94qIfrFb2Kfws1xT2hjgsN37Pso',
    title: '订单状态提醒',
  },
}

function fail(code, message, data = null) {
  return {
    code,
    message,
    data,
  }
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeSubscription(item, target, eventTypeFallback) {
  const templateKey = normalizeString(item?.templateKey)
  const template = notificationTemplateConfig[templateKey]
  const templateId = normalizeString(item?.templateId)
  const status = normalizeString(item?.status)
  const eventType = normalizeString(item?.eventType || eventTypeFallback)

  if (!template || template.templateId !== templateId || !validStatuses.includes(status)) {
    return null
  }

  if (eventType && !validEventTypes.includes(eventType)) {
    return null
  }

  return {
    templateKey,
    templateId,
    templateTitle: template.title,
    target,
    subscribeStatus: status,
    status: status === 'accept' ? 'accepted' : 'rejected',
    used: false,
    remainingCount: status === 'accept' ? 1 : 0,
    ...(eventType ? { eventType } : {}),
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const target = validTargets.includes(event.target) ? event.target : 'customer'
  const orderId = normalizeString(event.orderId)
  const eventType = normalizeString(event.eventType)
  const inputSubscriptions = Array.isArray(event.subscriptions) ? event.subscriptions : []

  if (!openid) {
    return fail(401, '请先登录后再订阅提醒')
  }

  const subscriptions = inputSubscriptions
    .map(item => normalizeSubscription(item, target, eventType))
    .filter(Boolean)

  if (!subscriptions.length) {
    return fail(400, '没有有效的订阅结果', {
      reason: 'invalid_subscriptions',
      receivedCount: inputSubscriptions.length,
      validTargets,
      validStatuses,
      validEventTypes,
      validTemplateKeys: Object.keys(notificationTemplateConfig),
    })
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get()
    const user = userRes.data[0]

    if (!user || user.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    if (target === 'staff' && !manageRoles.includes(user.role)) {
      return fail(403, '无权限订阅门店提醒')
    }

    if (target === 'customer' && orderId) {
      const orderRes = await db.collection('orders').doc(orderId).get()
      const order = orderRes.data

      if (!order) {
        return fail(404, '订单不存在')
      }

      if (order.openid !== openid) {
        return fail(403, '只能订阅自己的订单提醒')
      }
    }

    const now = new Date()
    const tasks = subscriptions.map(item => db.collection('notification_subscriptions').add({
      data: {
        ...item,
        orderId,
        openid,
        userId: user._id,
        role: user.role || 'customer',
        createdAt: now,
        updatedAt: now,
      },
    }))

    await Promise.all(tasks)

    return {
      code: 0,
      message: 'ok',
      data: {
        acceptedCount: subscriptions.filter(item => item.status === 'accepted').length,
        rejectedCount: subscriptions.filter(item => item.status !== 'accepted').length,
        acceptedTemplateKeys: subscriptions.filter(item => item.status === 'accepted').map(item => item.templateKey),
        rejectedTemplateKeys: subscriptions.filter(item => item.status !== 'accepted').map(item => item.templateKey),
        acceptedEventTypes: Array.from(new Set(subscriptions.filter(item => item.status === 'accepted').map(item => item.eventType).filter(Boolean))),
        rejectedEventTypes: Array.from(new Set(subscriptions.filter(item => item.status !== 'accepted').map(item => item.eventType).filter(Boolean))),
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '订阅记录保存失败')
  }
}
