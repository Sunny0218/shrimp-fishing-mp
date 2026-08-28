const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const manageRoles = ['staff', 'admin', 'super_admin']

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

  const dateValue = typeof value === 'object' && value.$date ? value.$date : value
  const time = new Date(dateValue).getTime()

  return Number.isNaN(time) ? 0 : time
}

function getMeteredRule(order) {
  const snapshot = order.pricingRuleSnapshot || {}
  const pricePerHour = Number(snapshot.pricePerHour || 0)
  const firstHourAmount = Number(snapshot.firstHourAmount || pricePerHour)
  const extraPricePerHour = Number(snapshot.extraPricePerHour || pricePerHour)
  const minimumMinutes = Number(snapshot.minimumMinutes || 0)
  const unitMinutes = Number(snapshot.unitMinutes || 60)

  if (firstHourAmount <= 0 || extraPricePerHour <= 0 || unitMinutes <= 0) {
    return null
  }

  return {
    firstHourAmount,
    extraPricePerHour,
    minimumMinutes,
    unitMinutes,
  }
}

function calculateMeteredAmount(actualDurationMinutes, rule) {
  const billableMinutes = Math.max(actualDurationMinutes, rule.minimumMinutes)
  const extraMinutes = Math.max(billableMinutes - 60, 0)
  const chargedExtraMinutes = extraMinutes > 0
    ? Math.ceil(extraMinutes / rule.unitMinutes) * rule.unitMinutes
    : 0
  const chargedMinutes = Math.max(60, Math.min(billableMinutes, 60) + chargedExtraMinutes)
  const amount = rule.firstHourAmount + Math.ceil((chargedExtraMinutes / 60) * rule.extraPricePerHour)

  return {
    chargedMinutes,
    amount,
  }
}

function normalizeSegments(session, order, now) {
  if (Array.isArray(session.segments) && session.segments.length) {
    return session.segments
  }

  const startedAt = session.startedAt || order.startedAt || order.checkedInAt || now
  const stoppedAt = session.stoppedAt || session.endedAt || null

  return [
    {
      startedAt,
      stoppedAt,
    },
  ]
}

function getSegmentDurationMinutes(segment, nowTime) {
  const startedAt = getDateTimeValue(segment.startedAt)
  const stoppedAt = getDateTimeValue(segment.stoppedAt) || nowTime

  if (!startedAt || stoppedAt <= startedAt) {
    return 0
  }

  return Math.ceil((stoppedAt - startedAt) / 60 / 1000)
}

function calculateRodSession(session, order, now, rule) {
  const nowTime = now.getTime()
  const segments = normalizeSegments(session, order, now).map(segment => ({
    ...segment,
    actualDurationMinutes: getSegmentDurationMinutes(segment, nowTime),
  }))
  const actualDurationMinutes = segments.reduce((total, segment) => total + Number(segment.actualDurationMinutes || 0), 0)
  const amountResult = calculateMeteredAmount(actualDurationMinutes, rule)
  const paidAmount = Number(session.paidAmount || rule.firstHourAmount)

  return {
    ...session,
    segments,
    actualDurationMinutes,
    chargedMinutes: amountResult.chargedMinutes,
    amount: amountResult.amount,
    paidAmount,
    checkoutAmount: Math.max(amountResult.amount - paidAmount, 0),
  }
}

function normalizeRodSessions(order, now, rule) {
  const rodCount = Math.max(Math.floor(Number(order.rodCount || 1)), 1)
  const sourceSessions = Array.isArray(order.rodSessions) && order.rodSessions.length
    ? order.rodSessions
    : Array.from({ length: rodCount }, (_, index) => ({
        id: `rod_${index + 1}`,
        label: `${index + 1}号杆`,
        status: 'in_progress',
        startedAt: order.startedAt || order.checkedInAt || now,
        paidAmount: rule.firstHourAmount,
      }))

  return sourceSessions.map((session, index) => ({
    id: session.id || `rod_${index + 1}`,
    label: session.label || `${index + 1}号杆`,
    status: session.status || 'in_progress',
    startedAt: session.startedAt || order.startedAt || order.checkedInAt || now,
    stoppedAt: session.stoppedAt || null,
    endedAt: session.endedAt || null,
    paidAmount: Number(session.paidAmount || rule.firstHourAmount),
    ...session,
  }))
}

function updateTargetRodSession(session, action, now) {
  const segments = Array.isArray(session.segments) ? [...session.segments] : []

  if (action === 'stop') {
    if (session.status !== 'in_progress') {
      throw new Error('只有计时中的杆位可以停杆')
    }

    const activeIndex = segments.findIndex(segment => !segment.stoppedAt)

    if (activeIndex >= 0) {
      segments[activeIndex] = {
        ...segments[activeIndex],
        stoppedAt: now,
      }
    }
    else {
      segments.push({
        startedAt: session.startedAt || now,
        stoppedAt: now,
      })
    }

    return {
      ...session,
      status: 'stopped',
      stoppedAt: now,
      segments,
    }
  }

  if (action === 'resume') {
    if (!['stopped', 'completed'].includes(session.status)) {
      throw new Error('只有已停杆的杆位可以续钟')
    }

    return {
      ...session,
      status: 'in_progress',
      stoppedAt: null,
      endedAt: null,
      segments: [
        ...segments,
        {
          startedAt: now,
          stoppedAt: null,
        },
      ],
    }
  }

  throw new Error('不支持的杆位操作')
}

function getOrderSummary(rodSessions, order) {
  const amount = rodSessions.reduce((total, session) => total + Number(session.amount || 0), 0)
  const paidAmount = Math.max(Number(order.paidAmount || 0), rodSessions.reduce((total, session) => total + Number(session.paidAmount || 0), 0))
  const checkoutAmount = Math.max(amount - paidAmount, 0)
  const actualDurationMinutes = Math.max(...rodSessions.map(session => Number(session.actualDurationMinutes || 0)), 0)
  const chargedMeteredMinutes = Math.max(...rodSessions.map(session => Number(session.chargedMinutes || 0)), 0)

  return {
    amount,
    paidAmount,
    checkoutAmount,
    actualDurationMinutes,
    chargedMeteredMinutes,
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const orderId = typeof event.orderId === 'string' ? event.orderId.trim() : ''
  const rodSessionId = typeof event.rodSessionId === 'string' ? event.rodSessionId.trim() : ''
  const action = typeof event.action === 'string' ? event.action.trim() : ''

  if (!openid) {
    return fail(401, '请先登录后再操作杆位')
  }

  if (!orderId) {
    return fail(400, '缺少订单 ID')
  }

  if (!rodSessionId) {
    return fail(400, '缺少杆位 ID')
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get()
    const user = userRes.data[0]

    if (!user || user.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    if (!manageRoles.includes(user.role)) {
      return fail(403, '无权限操作杆位')
    }

    const result = await db.runTransaction(async (transaction) => {
      const orderRef = transaction.collection('orders').doc(orderId)
      const orderRes = await orderRef.get()
      const order = orderRes.data

      if (!order) {
        throw new Error('订单不存在')
      }

      if (order.orderType !== 'metered') {
        throw new Error('只有现场计时订单可以操作杆位')
      }

      if (order.status !== 'in_progress') {
        throw new Error('只有进行中的订单可以操作杆位')
      }

      const rule = getMeteredRule(order)

      if (!rule) {
        throw new Error('订单缺少现场计费规则，无法操作杆位')
      }

      const now = new Date()
      const rodSessions = normalizeRodSessions(order, now, rule)
      const targetIndex = rodSessions.findIndex(session => session.id === rodSessionId)

      if (targetIndex < 0) {
        throw new Error('杆位不存在')
      }

      rodSessions[targetIndex] = updateTargetRodSession(rodSessions[targetIndex], action, now)

      const calculatedRodSessions = rodSessions.map(session => calculateRodSession(session, order, now, rule))
      const summary = getOrderSummary(calculatedRodSessions, order)
      const updateData = {
        rodSessions: calculatedRodSessions,
        actualDurationMinutes: summary.actualDurationMinutes,
        chargedMeteredMinutes: summary.chargedMeteredMinutes,
        finalAmount: summary.amount,
        checkoutAmount: summary.checkoutAmount,
        updatedAt: now,
      }

      await orderRef.update({
        data: updateData,
      })

      await transaction.collection('order_logs').add({
        data: {
          orderId,
          orderNo: order.orderNo,
          action: action === 'stop' ? 'stop_rod_session' : 'resume_rod_session',
          rodSessionId,
          operatorId: user._id,
          operatorRole: user.role,
          rodSessions: calculatedRodSessions,
          finalAmount: summary.amount,
          checkoutAmount: summary.checkoutAmount,
          createdAt: now,
        },
      })

      return {
        ...order,
        ...updateData,
      }
    })

    return {
      code: 0,
      message: 'ok',
      data: {
        order: result,
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '杆位操作失败')
  }
}
