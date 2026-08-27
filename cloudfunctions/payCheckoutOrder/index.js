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

function createPaymentNo() {
  const now = new Date()
  const dateText = [
    now.getFullYear(),
    `${now.getMonth() + 1}`.padStart(2, '0'),
    `${now.getDate()}`.padStart(2, '0'),
  ].join('')
  const timeText = [
    `${now.getHours()}`.padStart(2, '0'),
    `${now.getMinutes()}`.padStart(2, '0'),
    `${now.getSeconds()}`.padStart(2, '0'),
  ].join('')
  const randomText = Math.random().toString(36).slice(2, 8).toUpperCase()

  return `PAY${dateText}${timeText}${randomText}`
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const orderId = typeof event.orderId === 'string' ? event.orderId.trim() : ''

  if (!openid) {
    return fail(401, '请先登录后再支付结算金额')
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

      if (order.status !== 'pending_checkout') {
        throw new Error('当前订单不需要结账')
      }

      const checkoutAmount = Number(order.checkoutAmount || 0)

      if (checkoutAmount <= 0) {
        throw new Error('订单结账金额异常')
      }

      const now = new Date()
      const paymentNo = createPaymentNo()
      const checkoutType = order.orderType === 'metered' ? 'metered_checkout' : 'overtime_checkout'
      const paidBaseAmount = Math.max(
        Number(order.paidAmount || 0),
        Number(order.baseAmount || 0) - Number(order.discountAmount || 0),
      )
      const paidAmount = paidBaseAmount + checkoutAmount
      const updateData = {
        status: 'completed',
        paidAmount,
        checkoutAmount: 0,
        checkoutPaidAmount: checkoutAmount,
        checkoutPaidAt: now,
        completedAt: now,
        updatedAt: now,
      }
      const paymentRes = await transaction.collection('payments').add({
        data: {
          paymentNo,
          orderId,
          orderNo: order.orderNo,
          userId: user._id,
          openid,
          amount: checkoutAmount,
          type: 'checkout',
          checkoutType,
          channel: 'mock',
          status: 'paid',
          paidAt: now,
          createdAt: now,
          updatedAt: now,
        },
      })

      await transaction.collection('checkout_records').add({
        data: {
          orderId,
          orderNo: order.orderNo,
          userId: user._id,
          openid,
          amount: checkoutAmount,
          checkoutType,
          paymentId: paymentRes._id,
          paymentNo,
          status: 'paid',
          createdAt: now,
          updatedAt: now,
        },
      })

      await orderRef.update({
        data: updateData,
      })

      return {
        order: {
          ...order,
          ...updateData,
        },
        payment: {
          _id: paymentRes._id,
          paymentNo,
          amount: checkoutAmount,
          type: 'checkout',
          checkoutType,
          status: 'paid',
          paidAt: now,
        },
      }
    })

    return {
      code: 0,
      message: 'ok',
      data: result,
    }
  }
  catch (error) {
    return fail(500, error.message || '支付补款失败')
  }
}
