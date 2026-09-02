const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const command = db.command
const { manageRoles } = require('../common/roles')
const {
  normalizeStatus,
  normalizeDateRange,
  normalizePagination,
  getDateRangeBounds,
  getDateValue,
  resolvePaymentExpiredAt,
  isDateInRange,
  getBusinessDate,
  createSummary,
  filterOrders,
  sortOrders,
} = require('../common/orderQuery')

function fail(code, message) {
  return {
    code,
    message,
    data: null,
  }
}

async function getPendingPaymentExpireMinutes() {
  const settingsRes = await db.collection('settings').limit(1).get().catch(() => ({ data: [] }))
  const settings = settingsRes.data[0] || {}

  return Math.max(Math.floor(Number(settings.pendingPaymentExpireMinutes || 1)), 1)
}

async function closeOneExpiredPendingOrder(order, now) {
  const expireMinutes = await getPendingPaymentExpireMinutes()

  await db.runTransaction(async (transaction) => {
    const orderRef = transaction.collection('orders').doc(order._id)
    const latestOrderRes = await orderRef.get()
    const latestOrder = latestOrderRes.data

    if (!latestOrder || latestOrder.status !== 'pending_payment') {
      return
    }

    const expiredAt = resolvePaymentExpiredAt(latestOrder, expireMinutes)

    if (!expiredAt || expiredAt > now.getTime()) {
      if (expiredAt && !latestOrder.paymentExpiredAt) {
        await orderRef.update({
          data: {
            paymentExpiredAt: new Date(expiredAt),
          },
        })
      }
      return
    }

    await orderRef.update({
      data: {
        status: 'cancelled',
        paymentExpiredAt: latestOrder.paymentExpiredAt || new Date(expiredAt),
        cancelledAt: now,
        cancelReason: '待支付超时自动关闭',
        updatedAt: now,
      },
    })

    if (latestOrder.slotId) {
      const slotRef = transaction.collection('time_slots').doc(latestOrder.slotId)
      const slotRes = await slotRef.get().catch(() => ({ data: null }))
      const slot = slotRes.data

      if (slot) {
        const bookedCount = Math.max(Number(slot.bookedCount || 0) - 1, 0)
        await slotRef.update({
          data: {
            bookedCount,
            status: slot.status === 'full' && bookedCount < Number(slot.capacity || 0) ? 'available' : slot.status,
            updatedAt: now,
          },
        })
      }
    }
  })
}

async function closeExpiredPendingOrders(now) {
  const expiredRes = await db.collection('orders')
    .where({
      status: 'pending_payment',
    })
    .limit(100)
    .get()
    .catch(() => ({ data: [] }))

  const expireMinutes = await getPendingPaymentExpireMinutes()
  const expiredOrders = expiredRes.data.filter((order) => {
    const expiredAt = resolvePaymentExpiredAt(order, expireMinutes)

    return expiredAt && expiredAt <= now.getTime()
  })

  await Promise.all(expiredOrders.map(order => closeOneExpiredPendingOrder(order, now)))
}

async function fetchOrdersByWhere(where) {
  const rows = []
  const limit = 100
  const maxPages = 10

  for (let index = 0; index < maxPages; index += 1) {
    const res = await db.collection('orders')
      .where(where)
      .skip(index * limit)
      .limit(limit)
      .get()
      .catch(() => ({ data: [] }))

    rows.push(...res.data)

    if (res.data.length < limit) {
      break
    }
  }

  return rows
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return fail(401, '请先登录后再查看门店订单')
  }

  const status = normalizeStatus(event.status)
  const { startDate, endDate } = normalizeDateRange(event)
  const { page, pageSize, offset } = normalizePagination(event)
  const dateText = startDate
  const { start, end } = getDateRangeBounds(startDate, endDate)
  const dateRangeCommand = command.gte(start).and(command.lt(end))
  const dateTextRangeCommand = command.gte(startDate).and(command.lte(endDate))

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get()
    const user = userRes.data[0]

    if (!user || user.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    if (!manageRoles.includes(user.role)) {
      return fail(403, '无权限查看门店订单')
    }

    const now = new Date()
    await closeExpiredPendingOrders(now)

    const pricingRuleTask = db.collection('pricing_rules')
      .where({ status: 'active' })
      .orderBy('sort', 'asc')
      .limit(1)
      .get()
      .catch(() => ({ data: [] }))
    const queryTasks = [
      { createdAt: dateRangeCommand },
      { startedAt: dateRangeCommand },
      { checkedInAt: dateRangeCommand },
      { endedAt: dateRangeCommand },
      { finishedAt: dateRangeCommand },
      { completedAt: dateRangeCommand },
      { cancelledAt: dateRangeCommand },
      { refundedAt: dateRangeCommand },
      { updatedAt: dateRangeCommand },
      { 'slotSnapshot.date': dateTextRangeCommand },
    ].map(where => fetchOrdersByWhere(where))
    const [pricingRuleRes, orderResList] = await Promise.all([
      pricingRuleTask,
      Promise.all(queryTasks),
    ])
    const orderMap = new Map()

    orderResList.flat().forEach((order) => {
      if (order?._id) {
        orderMap.set(order._id, order)
      }
    })

    const allOrders = sortOrders([...orderMap.values()]
      .map(order => ({
        ...order,
        businessDate: getBusinessDate(order),
      }))
      .filter(order => isDateInRange(order.businessDate, startDate, endDate)))
    const summary = createSummary(allOrders)
    const rows = filterOrders(allOrders, status)
    const pagedRows = rows.slice(offset, offset + pageSize)

    return {
      code: 0,
      message: 'ok',
      data: {
        rows: pagedRows,
        page,
        pageSize,
        total: rows.length,
        hasMore: offset + pagedRows.length < rows.length,
        summary,
        date: dateText,
        startDate,
        endDate,
        activePricingRule: pricingRuleRes.data[0] || null,
        serverTime: new Date().toISOString(),
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '门店订单获取失败')
  }
}
