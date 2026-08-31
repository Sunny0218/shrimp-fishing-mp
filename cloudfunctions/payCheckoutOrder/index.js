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
    console.warn('[payCheckoutOrder] send notification failed', eventType, error)
  }
}

function getOperatorName(user, fallbackOpenid) {
  return user.nickname || user.phone || fallbackOpenid || ''
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
      const payment = await createMockPaidPayment(transaction, {
        order,
        orderId,
        userId: user._id,
        openid,
        amount: checkoutAmount,
        type: 'checkout',
        checkoutType,
        now,
      })

      await transaction.collection('checkout_records').add({
        data: {
          orderId,
          orderNo: order.orderNo,
          userId: user._id,
          openid,
          amount: checkoutAmount,
          checkoutType,
          paymentId: payment._id,
          paymentNo: payment.paymentNo,
          status: 'paid',
          createdAt: now,
          updatedAt: now,
        },
      })

      await orderRef.update({
        data: updateData,
      })
      let operationLogSaved = true

      await transaction.collection('operation_logs').add({
        data: {
          orderId,
          orderNo: order.orderNo,
          action: 'pay_checkout_order',
          actionText: '支付结算金额',
          operatorType: 'customer',
          operatorUserId: user._id,
          operatorOpenid: openid,
          operatorRole: user.role || 'customer',
          operatorName: getOperatorName(user, openid),
          payload: {
            checkoutAmount,
            checkoutType,
            paymentId: payment._id,
            paymentNo: payment.paymentNo,
            paidAmount,
            nextStatus: updateData.status,
          },
          createdAt: now,
        },
      }).catch((error) => {
        operationLogSaved = false
        console.warn('[payCheckoutOrder] save operation log failed', error)
      })

      return {
        order: {
          ...order,
          ...updateData,
        },
        payment: {
          _id: payment._id,
          paymentNo: payment.paymentNo,
          amount: checkoutAmount,
          type: 'checkout',
          checkoutType,
          status: 'paid',
          paidAt: now,
        },
        operationLogSaved,
      }
    })

    await sendOrderNotification(orderId, 'customer_completed')

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
