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

function createOrderNo() {
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
  const randomText = Math.random().toString(36).slice(2, 6).toUpperCase()

  return `SF${dateText}${timeText}${randomText}`
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

function normalizeCount(value, defaultValue) {
  const count = Number(value)

  if (!Number.isFinite(count)) {
    return defaultValue
  }

  return Math.max(Math.floor(count), defaultValue)
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return fail(401, '请先登录后再预约')
  }

  const packageId = typeof event.packageId === 'string' ? event.packageId.trim() : ''
  const slotId = typeof event.slotId === 'string' ? event.slotId.trim() : ''
  const remark = typeof event.remark === 'string' ? event.remark.trim() : ''

  if (!packageId) {
    return fail(400, '请选择套餐')
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get()
    const user = userRes.data[0]

    if (!user || user.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    const packageRes = await db.collection('packages').doc(packageId).get()
    const packageItem = packageRes.data

    if (!packageItem || packageItem.status !== 'active') {
      return fail(404, '套餐不存在或已下架')
    }

    const now = new Date()
    const orderNo = createOrderNo()
    const packageRodCount = Number(packageItem.rodCount || 1)
    const packageMaxPeople = Number(packageItem.maxPeople || packageRodCount || 1)
    const rodCount = normalizeCount(event.rodCount, packageRodCount)
    const peopleCount = normalizeCount(event.peopleCount, packageMaxPeople)
    const checkinCode = await createUniqueCheckinCode()
    const orderData = {
      orderNo,
      userId: user._id,
      openid,
      orderType: 'package',
      bookingMode: slotId ? 'slot' : 'walk_in',
      status: 'paid',
      packageId,
      rodCount,
      peopleCount,
      packageSnapshot: {
        packageId,
        name: packageItem.name || '',
        durationMinutes: Number(packageItem.durationMinutes || 0),
        price: Number(packageItem.price || 0),
        rodCount: Number(packageItem.rodCount || rodCount),
        maxPeople: Number(packageItem.maxPeople || peopleCount),
      },
      baseAmount: Number(packageItem.price || 0),
      goodsAmount: 0,
      adjustAmount: 0,
      discountAmount: 0,
      overtimeAmount: 0,
      checkoutAmount: 0,
      waivedOvertimeAmount: 0,
      paidAmount: Number(packageItem.price || 0),
      finalAmount: Number(packageItem.price || 0),
      remark,
      adminRemark: '',
      checkinCode,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    }

    async function addPaidOrder(transaction, data) {
      const orderRes = await transaction.collection('orders').add({
        data,
      })
      const payment = await createMockPaidPayment(transaction, {
        order: data,
        orderId: orderRes._id,
        userId: user._id,
        openid,
        amount: data.paidAmount,
        type: 'order',
        now,
      })

      return {
        orderRes,
        payment,
      }
    }

    if (!slotId) {
      const result = await db.runTransaction(async (transaction) => {
        return addPaidOrder(transaction, orderData)
      })

      return {
        code: 0,
        message: 'ok',
        data: {
          orderId: result.orderRes._id,
          orderNo,
          status: orderData.status,
          payment: {
            _id: result.payment._id,
            paymentNo: result.payment.paymentNo,
            amount: result.payment.amount,
            type: result.payment.type,
            status: result.payment.status,
            paidAt: result.payment.paidAt,
          },
        },
      }
    }

    const slotRes = await db.collection('time_slots').doc(slotId).get()
    const slot = slotRes.data

    if (!slot || slot.status !== 'available') {
      return fail(404, '场次不存在或不可预约')
    }

    const bookedCount = Number(slot.bookedCount || 0)
    const capacity = Number(slot.capacity || 0)

    if (capacity <= 0 || bookedCount >= capacity) {
      return fail(409, '当前场次已约满')
    }

    const nextBookedCount = bookedCount + 1
    const nextSlotStatus = nextBookedCount >= capacity ? 'full' : 'available'
    const slotOrderData = {
      ...orderData,
      slotId,
      slotSnapshot: {
        slotId,
        date: slot.date || '',
        startTime: slot.startTime || '',
        endTime: slot.endTime || '',
      },
    }

    const result = await db.runTransaction(async (transaction) => {
      const latestSlotRes = await transaction.collection('time_slots').doc(slotId).get()
      const latestSlot = latestSlotRes.data

      if (!latestSlot || latestSlot.status !== 'available') {
        throw new Error('当前场次已约满')
      }

      const latestBookedCount = Number(latestSlot.bookedCount || 0)
      const latestCapacity = Number(latestSlot.capacity || 0)

      if (latestCapacity <= 0 || latestBookedCount >= latestCapacity) {
        throw new Error('当前场次已约满')
      }

      const latestNextBookedCount = latestBookedCount + 1
      const latestNextSlotStatus = latestNextBookedCount >= latestCapacity ? 'full' : 'available'
      await transaction.collection('time_slots').doc(slotId).update({
        data: {
          bookedCount: command.inc(1),
          status: latestNextSlotStatus,
          updatedAt: now,
        },
      })

      return addPaidOrder(transaction, slotOrderData)
    })

    return {
      code: 0,
      message: 'ok',
      data: {
        orderId: result.orderRes._id,
        orderNo,
        status: slotOrderData.status,
        bookedCount: nextBookedCount,
        slotStatus: nextSlotStatus,
        payment: {
          _id: result.payment._id,
          paymentNo: result.payment.paymentNo,
          amount: result.payment.amount,
          type: result.payment.type,
          status: result.payment.status,
          paidAt: result.payment.paidAt,
        },
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '预约创建失败')
  }
}
