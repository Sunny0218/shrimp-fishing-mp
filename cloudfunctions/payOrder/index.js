const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const { createMockPaidPayment } = require('./paymentService')

function fail(code, message) {
  return {
    code,
    message,
    data: null,
  }
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

      const orderAmount = Math.max(Number(order.finalAmount || 0), Number(order.baseAmount || 0) - Number(order.discountAmount || 0))

      if (orderAmount <= 0) {
        throw new Error('订单支付金额异常')
      }

      const now = new Date()
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
      const updateData = {
        status: 'paid',
        checkinCode,
        paidAmount: orderAmount,
        updatedAt: now,
      }

      await orderRef.update({
        data: updateData,
      })

      return {
        order: {
          ...order,
          ...updateData,
        },
        payment,
      }
    })

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
