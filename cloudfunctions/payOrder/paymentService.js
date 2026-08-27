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

function createPaymentNo() {
  return createSerialNo('PAY')
}

async function createMockPaidPayment(transaction, params) {
  const {
    order,
    orderId,
    userId,
    openid,
    amount,
    type,
    checkoutType,
    now,
  } = params
  const paymentNo = createPaymentNo()
  const paymentData = {
    paymentNo,
    orderId,
    orderNo: order.orderNo,
    userId,
    openid,
    amount,
    type,
    ...(checkoutType ? { checkoutType } : {}),
    channel: 'mock',
    status: 'paid',
    paidAt: now,
    createdAt: now,
    updatedAt: now,
  }
  const paymentRes = await transaction.collection('payments').add({
    data: paymentData,
  })

  return {
    _id: paymentRes._id,
    ...paymentData,
  }
}

module.exports = {
  createMockPaidPayment,
}
