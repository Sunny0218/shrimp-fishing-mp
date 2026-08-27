function createSerialNo(prefix) {
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

  return `${prefix}${dateText}${timeText}${randomText}`
}

function createRefundNo() {
  return createSerialNo('REF')
}

async function createMockRefundPayment(transaction, params) {
  const {
    order,
    orderId,
    openid,
    amount,
    reason,
    now,
  } = params
  const refundNo = createRefundNo()
  const refundData = {
    paymentNo: refundNo,
    refundNo,
    orderId,
    orderNo: order.orderNo,
    userId: order.userId,
    openid,
    amount,
    type: 'refund',
    channel: 'mock',
    status: 'refunded',
    refundReason: reason,
    refundedAt: now,
    createdAt: now,
    updatedAt: now,
  }
  const refundRes = await transaction.collection('payments').add({
    data: refundData,
  })

  return {
    _id: refundRes._id,
    ...refundData,
  }
}

module.exports = {
  createMockRefundPayment,
}
