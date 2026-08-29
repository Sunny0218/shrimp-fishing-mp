const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()

function fail(code, message) {
  return {
    code,
    message,
    data: null,
  }
}

function getDateValue(value) {
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

function normalizePagination(event) {
  const page = Math.max(Math.floor(Number(event.page || 1)), 1)
  const pageSize = Math.min(Math.max(Math.floor(Number(event.pageSize || 20)), 1), 50)

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  }
}

async function getPendingPaymentExpireMinutes() {
  const settingsRes = await db.collection('settings').limit(1).get().catch(() => ({ data: [] }))
  const settings = settingsRes.data[0] || {}

  return Math.max(Math.floor(Number(settings.pendingPaymentExpireMinutes || 1)), 1)
}

function resolvePaymentExpiredAt(order, expireMinutes) {
  const savedExpiredAt = getDateValue(order.paymentExpiredAt)

  if (savedExpiredAt) {
    return savedExpiredAt
  }

  const createdAt = getDateValue(order.createdAt)

  return createdAt ? createdAt + expireMinutes * 60 * 1000 : 0
}

async function closeOneExpiredPendingOrder(order, now) {
  const expireMinutes = await getPendingPaymentExpireMinutes()

  await db.runTransaction(async (transaction) => {
    const orderRef = transaction.collection('orders').doc(order._id)
    const latestOrderRes = await orderRef.get()
    const latestOrder = latestOrderRes.data

    if (!latestOrder || latestOrder.status !== 'pending_payment') {
      return
    }

    const expiredAt = resolvePaymentExpiredAt(latestOrder, expireMinutes)

    if (!expiredAt || expiredAt > now.getTime()) {
      if (expiredAt && !latestOrder.paymentExpiredAt) {
        await orderRef.update({
          data: {
            paymentExpiredAt: new Date(expiredAt),
          },
        })
      }
      return
    }

    await orderRef.update({
      data: {
        status: 'cancelled',
        paymentExpiredAt: latestOrder.paymentExpiredAt || new Date(expiredAt),
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
}

async function closeExpiredPendingOrders(openid, now) {
  const expiredRes = await db.collection('orders')
    .where({
      openid,
      status: 'pending_payment',
    })
    .limit(100)
    .get()
    .catch(() => ({ data: [] }))

  const expireMinutes = await getPendingPaymentExpireMinutes()
  const expiredOrders = expiredRes.data.filter((order) => {
    const expiredAt = resolvePaymentExpiredAt(order, expireMinutes)

    return expiredAt && expiredAt <= now.getTime()
  })

  await Promise.all(expiredOrders.map(order => closeOneExpiredPendingOrder(order, now)))
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return fail(401, '请先登录后再查看订单')
  }

  const status = typeof event.status === 'string' ? event.status.trim() : 'all'
  const { page, pageSize, offset } = normalizePagination(event)

  try {
    await closeExpiredPendingOrders(openid, new Date())

    const where = status && status !== 'all'
      ? { openid, status }
      : { openid }

    const [countRes, listRes] = await Promise.all([
      db.collection('orders').where(where).count(),
      db
        .collection('orders')
        .where(where)
        .orderBy('createdAt', 'desc')
        .skip(offset)
        .limit(pageSize)
        .get(),
    ])

    return {
      code: 0,
      message: 'ok',
      data: {
        rows: listRes.data,
        page,
        pageSize,
        total: countRes.total,
        hasMore: offset + listRes.data.length < countRes.total,
        serverTime: new Date().toISOString(),
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '我的订单获取失败')
  }
}
