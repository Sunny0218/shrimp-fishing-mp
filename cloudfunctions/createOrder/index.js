const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const command = db.command

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

function createCheckinCode() {
  return `${Math.floor(100000 + Math.random() * 900000)}`
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
  const peopleCount = normalizeCount(event.peopleCount, 1)
  const rodCount = normalizeCount(event.rodCount, 1)
  const remark = typeof event.remark === 'string' ? event.remark.trim() : ''

  if (!packageId) {
    return fail(400, '请选择套餐')
  }

  if (!slotId) {
    return fail(400, '请选择场次')
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

    const now = new Date()
    const orderNo = createOrderNo()
    const nextBookedCount = bookedCount + 1
    const nextSlotStatus = nextBookedCount >= capacity ? 'full' : 'available'
    const orderData = {
      orderNo,
      userId: user._id,
      openid,
      orderType: 'package',
      status: 'paid',
      slotId,
      packageId,
      rodCount,
      peopleCount,
      packageSnapshot: {
        packageId,
        name: packageItem.name || '',
        durationMinutes: Number(packageItem.durationMinutes || 0),
        price: Number(packageItem.price || 0),
        rodCount: Number(packageItem.rodCount || rodCount),
      },
      slotSnapshot: {
        slotId,
        date: slot.date || '',
        startTime: slot.startTime || '',
        endTime: slot.endTime || '',
      },
      baseAmount: Number(packageItem.price || 0),
      goodsAmount: 0,
      adjustAmount: 0,
      discountAmount: 0,
      paidAmount: 0,
      finalAmount: Number(packageItem.price || 0),
      remark,
      adminRemark: '',
      checkinCode: createCheckinCode(),
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
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

      return transaction.collection('orders').add({
        data: orderData,
      })
    })

    return {
      code: 0,
      message: 'ok',
      data: {
        orderId: result._id,
        orderNo,
        status: orderData.status,
        bookedCount: nextBookedCount,
        slotStatus: nextSlotStatus,
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '预约创建失败')
  }
}
