const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const command = db.command
const { createMockPaidPayment } = require('./paymentService')

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

async function releaseSlotIfNeeded(transaction, order, now) {
  if (!order.slotId) {
    return
  }

  const slotRef = transaction.collection('time_slots').doc(order.slotId)
  const slotRes = await slotRef.get().catch(() => ({ data: null }))
  const slot = slotRes.data

  if (!slot) {
    return
  }

  const bookedCount = Math.max(Number(slot.bookedCount || 0) - 1, 0)

  await slotRef.update({
    data: {
      bookedCount,
      status: slot.status === 'full' && bookedCount < Number(slot.capacity || 0) ? 'available' : slot.status,
      updatedAt: now,
    },
  })
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

function createRandomCheckinCode() {
  return `${Math.floor(10000000 + Math.random() * 90000000)}`
}

async function createUniqueCheckinCode() {
  const maxRetryCount = 10

  for (let index = 0; index < maxRetryCount; index += 1) {
    const checkinCode = createRandomCheckinCode()
    const existingRes = await db.collection('orders')
      .where({
        checkinCode,
        status: 'paid',
      })
      .limit(1)
      .get()

    if (!existingRes.data.length) {
      return checkinCode
    }
  }

  throw new Error('核销码生成失败，请重试')
}

async function sendOrderNotification(orderId, eventType) {
  try {
    await cloud.callFunction({
      name: 'sendOrderNotification',
      data: {
        orderId,
        eventType,
      },
    })
  }
  catch (error) {
    console.warn('[payOrder] send notification failed', error)
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const orderId = typeof event.orderId === 'string' ? event.orderId.trim() : ''

  if (!openid) {
    return fail(401, '请先登录后再支付订单')
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

    const expireMinutes = await getPendingPaymentExpireMinutes()
    const result = await db.runTransaction(async (transaction) => {
      const orderRef = transaction.collection('orders').doc(orderId)
      const orderRes = await orderRef.get()
      const order = orderRes.data

      if (!order) {
        throw new Error('订单不存在')
      }

      if (order.openid !== openid) {
        throw new Error('只能支付自己的订单')
      }

      if (order.status !== 'pending_payment') {
        throw new Error('当前订单不需要支付')
      }

      const now = new Date()
      const expiredAt = resolvePaymentExpiredAt(order, expireMinutes)
      const paymentExpiredAt = expiredAt ? order.paymentExpiredAt || new Date(expiredAt) : null

      if (expiredAt && expiredAt <= now.getTime()) {
        const updateData = {
          status: 'cancelled',
          ...(paymentExpiredAt ? { paymentExpiredAt } : {}),
          cancelledAt: now,
          cancelReason: '待支付超时自动关闭',
          updatedAt: now,
        }

        await orderRef.update({
          data: updateData,
        })
        await releaseSlotIfNeeded(transaction, order, now)

        return {
          expired: true,
          order: {
            ...order,
            ...updateData,
          },
        }
      }

      const orderAmount = Math.max(Number(order.finalAmount || 0), Number(order.baseAmount || 0) - Number(order.discountAmount || 0))

      if (orderAmount <= 0) {
        throw new Error('订单支付金额异常')
      }

      const checkinCode = order.checkinCode || await createUniqueCheckinCode()
      const payment = await createMockPaidPayment(transaction, {
        order,
        orderId,
        userId: user._id,
        openid,
        amount: orderAmount,
        type: 'order',
        now,
      })
      const rodSessions = Array.isArray(order.rodSessions)
        ? order.rodSessions.map(item => ({
            ...item,
            paidAmount: order.orderType === 'metered'
              ? Math.max(Number(item.paidAmount || 0), Number(item.amount || 0))
              : item.paidAmount,
          }))
        : order.rodSessions
      const updateData = {
        status: 'paid',
        checkinCode,
        paidAmount: orderAmount,
        ...(Array.isArray(rodSessions) ? { rodSessions } : {}),
        updatedAt: now,
      }

      await orderRef.update({
        data: updateData,
      })

      return {
        expired: false,
        order: {
          ...order,
          ...updateData,
        },
        payment,
      }
    })

    if (result.expired) {
      return fail(409, '订单已超时关闭，请重新预约')
    }

    await sendOrderNotification(orderId, 'customer_paid')

    return {
      code: 0,
      message: 'ok',
      data: result,
    }
  }
  catch (error) {
    return fail(500, error.message || '订单支付失败')
  }
}
