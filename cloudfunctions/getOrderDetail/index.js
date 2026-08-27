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

function getDateTimeValue(value) {
  if (!value) {
    return 0
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 0 : value.getTime()
  }

  if (typeof value === 'object' && typeof value.toDate === 'function') {
    const date = value.toDate()

    return Number.isNaN(date.getTime()) ? 0 : date.getTime()
  }

  const time = new Date(value).getTime()

  return Number.isNaN(time) ? 0 : time
}

async function getPendingPaymentExpireMinutes() {
  const settingsRes = await db.collection('settings').limit(1).get().catch(() => ({ data: [] }))
  const settings = settingsRes.data[0] || {}

  return Math.max(Math.floor(Number(settings.pendingPaymentExpireMinutes || 1)), 1)
}

function resolvePaymentExpiredAt(order, expireMinutes) {
  const savedExpiredAt = getDateTimeValue(order.paymentExpiredAt)

  if (savedExpiredAt) {
    return savedExpiredAt
  }

  const createdAt = getDateTimeValue(order.createdAt)

  return createdAt ? createdAt + expireMinutes * 60 * 1000 : 0
}

async function closeExpiredPendingOrder(orderId, order) {
  if (order.status !== 'pending_payment') {
    return order
  }

  const now = new Date()
  const expireMinutes = await getPendingPaymentExpireMinutes()
  const expiredAt = resolvePaymentExpiredAt(order, expireMinutes)

  if (!expiredAt) {
    return order
  }

  const paymentExpiredAt = order.paymentExpiredAt || new Date(expiredAt)

  if (expiredAt > now.getTime()) {
    if (!order.paymentExpiredAt) {
      await db.collection('orders').doc(orderId).update({
        data: {
          paymentExpiredAt,
        },
      })
    }

    return {
      ...order,
      paymentExpiredAt,
    }
  }

  await db.runTransaction(async (transaction) => {
    const orderRef = transaction.collection('orders').doc(orderId)
    const latestOrderRes = await orderRef.get()
    const latestOrder = latestOrderRes.data

    if (!latestOrder || latestOrder.status !== 'pending_payment') {
      return
    }

    const latestExpiredAt = resolvePaymentExpiredAt(latestOrder, expireMinutes)

    if (!latestExpiredAt || latestExpiredAt > now.getTime()) {
      return
    }

    await orderRef.update({
      data: {
        status: 'cancelled',
        paymentExpiredAt: latestOrder.paymentExpiredAt || new Date(latestExpiredAt),
        cancelledAt: now,
        cancelReason: '待支付超时自动关闭',
        updatedAt: now,
      },
    })

    if (latestOrder.slotId) {
      const slotRef = transaction.collection('time_slots').doc(latestOrder.slotId)
      const slotRes = await slotRef.get().catch(() => ({ data: null }))
      const slot = slotRes.data

      if (slot) {
        const bookedCount = Math.max(Number(slot.bookedCount || 0) - 1, 0)
        await slotRef.update({
          data: {
            bookedCount,
            status: slot.status === 'full' && bookedCount < Number(slot.capacity || 0) ? 'available' : slot.status,
            updatedAt: now,
          },
        })
      }
    }
  })

  return {
    ...order,
    paymentExpiredAt,
    status: 'cancelled',
    cancelledAt: now,
    cancelReason: '待支付超时自动关闭',
    updatedAt: now,
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const orderId = typeof event.orderId === 'string' ? event.orderId.trim() : ''

  if (!openid) {
    return fail(401, '请先登录后再查看订单')
  }

  if (!orderId) {
    return fail(400, '缺少订单 ID')
  }

  try {
    const [userRes, orderRes] = await Promise.all([
      db.collection('users').where({ openid }).limit(1).get(),
      db.collection('orders').doc(orderId).get(),
    ])
    const user = userRes.data[0]
    const order = orderRes.data

    if (!user || user.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    if (!order) {
      return fail(404, '订单不存在')
    }

    const canManage = manageRoles.includes(user.role)
    const isOwner = order.openid === openid

    if (!canManage && !isOwner) {
      return fail(403, '无权限查看该订单')
    }

    const displayOrder = await closeExpiredPendingOrder(orderId, order)
    const [packageRes, timeSlotRes, pricingRuleRes] = await Promise.all([
      displayOrder.packageId ? db.collection('packages').doc(displayOrder.packageId).get().catch(() => ({ data: null })) : Promise.resolve({ data: null }),
      displayOrder.slotId ? db.collection('time_slots').doc(displayOrder.slotId).get().catch(() => ({ data: null })) : Promise.resolve({ data: null }),
      displayOrder.orderType !== 'metered' && !displayOrder.pricingRuleSnapshot
        ? db.collection('pricing_rules').where({ status: 'active' }).orderBy('sort', 'asc').limit(1).get().catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
    ])

    return {
      code: 0,
      message: 'ok',
      data: {
        order: displayOrder,
        package: packageRes.data,
        timeSlot: timeSlotRes.data,
        activePricingRule: pricingRuleRes.data[0] || null,
        serverTime: new Date().toISOString(),
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '订单详情获取失败')
  }
}
