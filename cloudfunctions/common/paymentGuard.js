const { CUSTOMER_ROLE } = require('./roles')

const blockingPaymentStatuses = ['pending_payment', 'pending_checkout']
const blockingPaymentMessage = '你有一笔订单待支付，请先完成支付或取消后再继续下单'

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

async function getPendingPaymentExpireMinutes(db) {
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

async function closeOneExpiredPendingOrder(db, order, now, expireMinutes) {
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

async function closeExpiredPendingOrders(db, openid, now) {
  const pendingRes = await db.collection('orders')
    .where({
      openid,
      status: 'pending_payment',
    })
    .limit(100)
    .get()
    .catch(() => ({ data: [] }))
  const expireMinutes = await getPendingPaymentExpireMinutes(db)
  const expiredOrders = pendingRes.data.filter((order) => {
    const expiredAt = resolvePaymentExpiredAt(order, expireMinutes)

    return expiredAt && expiredAt <= now.getTime()
  })

  await Promise.all(expiredOrders.map(order => closeOneExpiredPendingOrder(db, order, now, expireMinutes)))
}

async function findBlockingPaymentOrder(db, command, openid) {
  const blockingRes = await db.collection('orders')
    .where({
      openid,
      status: command.in(blockingPaymentStatuses),
    })
    .orderBy('updatedAt', 'desc')
    .limit(1)
    .get()
    .catch(() => ({ data: [] }))

  return blockingRes.data[0] || null
}

async function ensureCustomerCanCreateOrder(db, command, user, openid, now = new Date()) {
  if ((user.role || CUSTOMER_ROLE) !== CUSTOMER_ROLE) {
    return {
      ok: true,
      blockingOrder: null,
      message: '',
    }
  }

  await closeExpiredPendingOrders(db, openid, now)

  const blockingOrder = await findBlockingPaymentOrder(db, command, openid)

  if (!blockingOrder) {
    return {
      ok: true,
      blockingOrder: null,
      message: '',
    }
  }

  return {
    ok: false,
    blockingOrder,
    message: blockingPaymentMessage,
  }
}

module.exports = {
  blockingPaymentStatuses,
  blockingPaymentMessage,
  closeExpiredPendingOrders,
  ensureCustomerCanCreateOrder,
}
