const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const { manageRoles } = require('../common/roles')

function fail(code, message) {
  return {
    code,
    message,
    data: null,
  }
}

function normalizeCheckinCode(value) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return ''
  }

  return `${value}`.trim()
}

function normalizePricingRuleSnapshot(pricingRule) {
  if (!pricingRule) {
    return null
  }

  const pricePerHour = Number(pricingRule.pricePerHour || 0)
  const firstHourAmount = Number(pricingRule.firstHourAmount || pricePerHour)
  const extraPricePerHour = Number(pricingRule.extraPricePerHour || pricePerHour)
  const minimumMinutes = Number(pricingRule.minimumMinutes || 0)
  const unitMinutes = Number(pricingRule.unitMinutes || 60)

  if (extraPricePerHour <= 0 || unitMinutes <= 0) {
    return null
  }

  return {
    pricingRuleId: pricingRule._id,
    name: pricingRule.name || '现场计时标准价',
    pricePerHour: pricePerHour > 0 ? pricePerHour : firstHourAmount,
    firstHourAmount,
    extraPricePerHour,
    minimumMinutes,
    unitMinutes,
  }
}

async function getActivePricingRuleSnapshot() {
  const pricingRuleRes = await db.collection('pricing_rules')
    .where({ status: 'active' })
    .orderBy('sort', 'asc')
    .limit(1)
    .get()
  const pricingRuleSnapshot = normalizePricingRuleSnapshot(pricingRuleRes.data[0])

  if (!pricingRuleSnapshot) {
    throw new Error('门店暂未配置启用计费规则，无法开始计时')
  }

  return pricingRuleSnapshot
}

async function findOrderByCheckinCode(checkinCode) {
  const orderRes = await db.collection('orders')
    .where({
      checkinCode,
      status: 'paid',
    })
    .limit(2)
    .get()

  if (!orderRes.data.length) {
    throw new Error('未找到可核销订单，请检查核销码')
  }

  if (orderRes.data.length > 1) {
    throw new Error('该核销码匹配多个订单，请扫码核销')
  }

  return orderRes.data[0]
}

async function sendOrderNotification(orderId, eventType) {
  await cloud.callFunction({
    name: 'sendOrderNotification',
    data: {
      orderId,
      eventType,
    },
  }).catch((error) => {
    console.warn('[checkInOrder] send notification failed', error)
  })
}

function getOperatorName(user, fallbackOpenid) {
  return user.nickname || user.phone || fallbackOpenid || ''
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const orderId = typeof event.orderId === 'string' ? event.orderId.trim() : ''
  const checkinCode = normalizeCheckinCode(event.checkinCode)

  if (!openid) {
    return fail(401, '请先登录后再核销')
  }

  if (!checkinCode) {
    return fail(400, '请输入核销码')
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get()
    const user = userRes.data[0]

    if (!user || user.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    if (!manageRoles.includes(user.role)) {
      return fail(403, '无权限核销订单')
    }

    const targetOrder = orderId
      ? (await db.collection('orders').doc(orderId).get()).data
      : await findOrderByCheckinCode(checkinCode)

    if (!targetOrder) {
      return fail(404, '订单不存在')
    }

    if (targetOrder.checkinCode !== checkinCode) {
      return fail(400, '核销码不匹配')
    }

    if (targetOrder.status !== 'paid') {
      return fail(409, '当前订单不可核销')
    }

    const pricingRuleSnapshot = targetOrder.orderType === 'metered'
      ? null
      : await getActivePricingRuleSnapshot()
    const now = new Date()
    const targetOrderId = orderId || targetOrder._id
    const result = await db.runTransaction(async (transaction) => {
      const orderRef = transaction.collection('orders').doc(targetOrderId)
      const latestOrderRes = await orderRef.get()
      const latestOrder = latestOrderRes.data

      if (!latestOrder) {
        throw new Error('订单不存在')
      }

      if (latestOrder.checkinCode !== checkinCode) {
        throw new Error('核销码不匹配')
      }

      if (latestOrder.status !== 'paid') {
        throw new Error('当前订单不可核销')
      }

      const durationMinutes = Number(latestOrder.packageSnapshot?.durationMinutes || 0)
      const expectedEndedAt = durationMinutes > 0
        ? new Date(now.getTime() + durationMinutes * 60 * 1000)
        : null
      const rodSessions = Array.isArray(latestOrder.rodSessions)
        ? latestOrder.rodSessions.map(item => ({
            ...item,
            status: 'in_progress',
            startedAt: now,
            stoppedAt: null,
            segments: [
              {
                startedAt: now,
                stoppedAt: null,
              },
            ],
          }))
        : latestOrder.rodSessions
      const updateData = {
        status: 'in_progress',
        checkedInAt: now,
        startedAt: now,
        expectedEndedAt,
        pricingRuleId: pricingRuleSnapshot?.pricingRuleId || latestOrder.pricingRuleId || '',
        pricingRuleSnapshot: pricingRuleSnapshot || latestOrder.pricingRuleSnapshot || null,
        ...(Array.isArray(rodSessions) ? { rodSessions } : {}),
        checkedInBy: user._id,
        updatedAt: now,
      }

      await orderRef.update({
        data: updateData,
      })

      await transaction.collection('checkins').add({
        data: {
          orderId: targetOrderId,
          orderNo: latestOrder.orderNo,
          checkinCode,
          customerOpenid: latestOrder.openid,
          checkedInBy: user._id,
          checkedInByOpenid: openid,
          status: 'checked_in',
          source: orderId ? 'scan' : 'manual',
          packageSnapshot: latestOrder.packageSnapshot || null,
          pricingRuleSnapshot: pricingRuleSnapshot || latestOrder.pricingRuleSnapshot || null,
          startedAt: now,
          expectedEndedAt,
          createdAt: now,
        },
      })

      let operationLogSaved = true

      await transaction.collection('operation_logs').add({
        data: {
          orderId: targetOrderId,
          orderNo: latestOrder.orderNo,
          action: 'check_in_order',
          actionText: '核销并开始计时',
          operatorType: 'staff',
          operatorUserId: user._id,
          operatorOpenid: openid,
          operatorRole: user.role,
          operatorName: getOperatorName(user, openid),
          payload: {
            checkinCode,
            source: orderId ? 'scan' : 'manual',
            customerOpenid: latestOrder.openid,
            startedAt: now,
            expectedEndedAt,
          },
          createdAt: now,
        },
      }).catch((error) => {
        operationLogSaved = false
        console.warn('[checkInOrder] save operation log failed', error)
      })

      return {
        order: {
          ...latestOrder,
          ...updateData,
        },
        operationLogSaved,
      }
    })

    await sendOrderNotification(targetOrderId, 'customer_started')

    return {
      code: 0,
      message: 'ok',
      data: {
        order: result.order,
        checkedInAt: now.toISOString(),
        operationLogSaved: result.operationLogSaved,
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '订单核销失败')
  }
}
