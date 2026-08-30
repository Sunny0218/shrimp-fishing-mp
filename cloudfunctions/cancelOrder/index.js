const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const command = db.command
const cancellableStatuses = ['pending_payment', 'paid']
const { createMockRefundPayment } = require('./paymentService')

function fail(code, message) {
  return {
    code,
    message,
    data: null,
  }
}

function hasDateValue(value) {
  return !!value
}

function canDirectRefund(order) {
  if (order.status !== 'paid') {
    return false
  }

  if (!['package', 'metered'].includes(order.orderType || 'package')) {
    return false
  }

  if (hasDateValue(order.checkedInAt) || hasDateValue(order.startedAt)) {
    return false
  }

  if (hasDateValue(order.refundedAt) || order.refundNo || order.refundStatus === 'refunded') {
    return false
  }

  return true
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const orderId = typeof event.orderId === 'string' ? event.orderId.trim() : ''

  if (!openid) {
    return fail(401, '请先登录后再取消预约')
  }

  if (!orderId) {
    return fail(400, '缺少订单 ID')
  }

  try {
    const result = await db.runTransaction(async (transaction) => {
      const orderRes = await transaction.collection('orders').doc(orderId).get()
      const order = orderRes.data

      if (!order) {
        throw new Error('订单不存在')
      }

      if (order.openid !== openid) {
        throw new Error('无权限取消该订单')
      }

      if (!cancellableStatuses.includes(order.status)) {
        throw new Error('当前订单已核销或已完成，不能取消')
      }

      if (order.status === 'paid' && !canDirectRefund(order)) {
        throw new Error('当前订单已核销或已开始计时，不能直接退款')
      }

      const now = new Date()
      const paidAmount = Math.max(
        Number(order.paidAmount || 0),
        Number(order.finalAmount || 0),
        Number(order.baseAmount || 0) - Number(order.discountAmount || 0),
      )
      const isRefundOrder = canDirectRefund(order) && paidAmount > 0
      const refundAmount = isRefundOrder
        ? paidAmount
        : 0
      const nextStatus = isRefundOrder ? 'refunded' : 'cancelled'
      const refundPayment = isRefundOrder
        ? await createMockRefundPayment(transaction, {
            order,
            orderId,
            openid,
            amount: refundAmount,
            reason: '用户未开始服务直接退款',
            now,
          })
        : null
      const updateData = {
        status: nextStatus,
        updatedAt: now,
        cancelledAt: now,
        refundAmount,
        refundNo: refundPayment?.refundNo || '',
        refundStatus: isRefundOrder ? 'refunded' : '',
        refundReason: isRefundOrder ? '用户未开始服务直接退款' : '',
        refundedAt: isRefundOrder ? now : null,
      }

      await transaction.collection('orders').doc(orderId).update({
        data: updateData,
      })

      if (order.slotId) {
        const slotRes = await transaction.collection('time_slots').doc(order.slotId).get().catch(() => ({ data: null }))
        const slot = slotRes.data

        if (slot) {
          const bookedCount = Math.max(Number(slot.bookedCount || 0) - 1, 0)
          await transaction.collection('time_slots').doc(order.slotId).update({
            data: {
              bookedCount: command.inc(-1),
              status: slot.status === 'full' && bookedCount < Number(slot.capacity || 0) ? 'available' : slot.status,
              updatedAt: now,
            },
          })
        }
      }

      return {
        orderId,
        status: nextStatus,
        refundAmount,
        refundNo: refundPayment?.refundNo || '',
      }
    })

    return {
      code: 0,
      message: 'ok',
      data: result,
    }
  }
  catch (error) {
    return fail(500, error.message || '取消预约失败')
  }
}
