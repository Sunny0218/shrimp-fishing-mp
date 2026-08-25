const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const manageRoles = ['staff', 'admin', 'super_admin']
const waiverRoles = ['admin', 'super_admin']
const overtimeUnitMinutes = 30
const overtimeUnitAmount = 3000
const staffEarlyFinishLimitMinutes = 10

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

  const time = new Date(value).getTime()

  return Number.isNaN(time) ? 0 : time
}

function getExpectedEndedAt(order) {
  const savedExpectedEndedAt = getDateTimeValue(order.expectedEndedAt)

  if (savedExpectedEndedAt) {
    return savedExpectedEndedAt
  }

  const startedAt = getDateTimeValue(order.startedAt || order.checkedInAt)
  const durationMinutes = Number(order.packageSnapshot?.durationMinutes || 0)

  if (!startedAt || durationMinutes <= 0) {
    return 0
  }

  return startedAt + durationMinutes * 60 * 1000
}

function getActualDurationMinutes(startedAt, endedAt) {
  if (!startedAt || !endedAt || endedAt <= startedAt) {
    return 0
  }

  return Math.ceil((endedAt - startedAt) / 60 / 1000)
}

function getOvertimeMinutes(expectedEndedAt, endedAt) {
  if (!expectedEndedAt || endedAt <= expectedEndedAt) {
    return 0
  }

  return Math.ceil((endedAt - expectedEndedAt) / 60 / 1000)
}

function getOvertimeAmount(overtimeMinutes) {
  if (overtimeMinutes <= 0) {
    return {
      chargedOvertimeMinutes: 0,
      overtimeAmount: 0,
    }
  }

  const units = Math.ceil(overtimeMinutes / overtimeUnitMinutes)

  return {
    chargedOvertimeMinutes: units * overtimeUnitMinutes,
    overtimeAmount: units * overtimeUnitAmount,
  }
}

function getFinalAmount(order, overtimeAmount) {
  return Number(order.baseAmount || 0)
    + Number(order.goodsAmount || 0)
    + Number(order.adjustAmount || 0)
    + Number(overtimeAmount || 0)
    - Number(order.discountAmount || 0)
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const orderId = typeof event.orderId === 'string' ? event.orderId.trim() : ''
  const waiveOvertime = event.waiveOvertime === true
  const waiverReason = typeof event.waiverReason === 'string' ? event.waiverReason.trim() : ''
  const reason = typeof event.reason === 'string' ? event.reason.trim() : ''
  const earlyFinishReason = typeof event.earlyFinishReason === 'string' ? event.earlyFinishReason.trim() : reason

  if (!openid) {
    return fail(401, '请先登录后再结束计时')
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

    if (!manageRoles.includes(user.role)) {
      return fail(403, '无权限结束计时')
    }

    if (waiveOvertime && !waiverRoles.includes(user.role)) {
      return fail(403, '只有管理员可以免收超时费')
    }

    if (waiveOvertime && !waiverReason) {
      return fail(400, '请填写免收原因')
    }

    const result = await db.runTransaction(async (transaction) => {
      const orderRef = transaction.collection('orders').doc(orderId)
      const orderRes = await orderRef.get()
      const order = orderRes.data

      if (!order) {
        throw new Error('订单不存在')
      }

      if (order.status !== 'in_progress') {
        throw new Error('只有进行中的订单可以结束计时')
      }

      const now = new Date()
      const startedAt = getDateTimeValue(order.startedAt || order.checkedInAt)
      const endedAt = now.getTime()
      const expectedEndedAt = getExpectedEndedAt(order)

      if (!startedAt || !expectedEndedAt) {
        throw new Error('订单缺少计时信息，无法结束')
      }

      const actualDurationMinutes = getActualDurationMinutes(startedAt, endedAt)
      const overtimeMinutes = getOvertimeMinutes(expectedEndedAt, endedAt)
      const earlyFinishedMinutes = endedAt < expectedEndedAt
        ? Math.ceil((expectedEndedAt - endedAt) / 60 / 1000)
        : 0

      if (earlyFinishedMinutes > staffEarlyFinishLimitMinutes && !waiverRoles.includes(user.role)) {
        throw new Error('距离预计结束还较久，请管理员确认后提前完成')
      }

      if (earlyFinishedMinutes > staffEarlyFinishLimitMinutes && !earlyFinishReason) {
        throw new Error('请填写提前完成原因')
      }

      const overtimeResult = getOvertimeAmount(overtimeMinutes)
      const shouldWaiveOvertime = waiveOvertime && overtimeResult.overtimeAmount > 0
      const chargedOvertimeMinutes = shouldWaiveOvertime ? 0 : overtimeResult.chargedOvertimeMinutes
      const overtimeAmount = shouldWaiveOvertime ? 0 : overtimeResult.overtimeAmount
      const waivedOvertimeAmount = shouldWaiveOvertime ? overtimeResult.overtimeAmount : 0
      const nextStatus = overtimeAmount > 0 ? 'pending_checkout' : 'completed'
      const checkoutAmount = overtimeAmount
      const finalAmount = getFinalAmount(order, overtimeAmount)
      const updateData = {
        status: nextStatus,
        endedAt: now,
        finishedAt: now,
        finishedBy: user._id,
        actualDurationMinutes,
        overtimeMinutes,
        chargedOvertimeMinutes,
        overtimeAmount,
        checkoutAmount,
        waivedOvertimeAmount,
        waiverReason: shouldWaiveOvertime ? waiverReason : '',
        earlyFinishedMinutes,
        earlyFinishReason: earlyFinishedMinutes > staffEarlyFinishLimitMinutes ? earlyFinishReason : '',
        finalAmount,
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
        log: {
          orderId,
          orderNo: order.orderNo,
          action: 'finish_timing',
          operatorId: user._id,
          operatorRole: user.role,
          startedAt: order.startedAt || order.checkedInAt,
          expectedEndedAt: new Date(expectedEndedAt),
          endedAt: now,
          actualDurationMinutes,
          overtimeMinutes,
          chargedOvertimeMinutes,
          overtimeAmount,
          waivedOvertimeAmount,
          waiverReason: updateData.waiverReason,
          earlyFinishedMinutes,
          earlyFinishReason: updateData.earlyFinishReason,
          nextStatus,
          createdAt: now,
        },
      }
    })

    let logSaved = true

    try {
      await db.collection('order_logs').add({
        data: result.log,
      })
    }
    catch {
      logSaved = false
    }

    return {
      code: 0,
      message: 'ok',
      data: {
        order: result.order,
        logSaved,
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '结束计时失败')
  }
}
