const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const { manageRoles } = require('../common/roles')
const {
  getMeteredRule,
  calculateRodSession,
  normalizeRodSessions,
  updateTargetRodSession,
  getOrderSummary,
} = require('../common/meteredBilling')

function fail(code, message) {
  return {
    code,
    message,
    data: null,
  }
}

function getOperatorName(user, fallbackOpenid) {
  return user.nickname || user.phone || fallbackOpenid || ''
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

      let operationLogSaved = true

      await transaction.collection('operation_logs').add({
        data: {
          orderId,
          orderNo: order.orderNo,
          action: action === 'stop' ? 'stop_rod_session' : 'resume_rod_session',
          actionText: action === 'stop' ? '单杆停杆' : '单杆续钟',
          operatorType: 'staff',
          operatorUserId: user._id,
          operatorOpenid: openid,
          operatorRole: user.role,
          operatorName: getOperatorName(user, openid),
          payload: {
            rodSessionId,
            rodLabel: calculatedRodSessions[targetIndex]?.label || '',
            rodStatus: calculatedRodSessions[targetIndex]?.status || '',
            actualDurationMinutes: calculatedRodSessions[targetIndex]?.actualDurationMinutes || 0,
            finalAmount: summary.amount,
            checkoutAmount: summary.checkoutAmount,
          },
          createdAt: now,
        },
      }).catch((error) => {
        operationLogSaved = false
        console.warn('[updateRodSession] save operation log failed', error)
      })

      return {
        order: {
          ...order,
          ...updateData,
        },
        operationLogSaved,
      }
    })

    return {
      code: 0,
      message: 'ok',
      data: {
        order: result.order,
        operationLogSaved: result.operationLogSaved,
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '杆位操作失败')
  }
}
