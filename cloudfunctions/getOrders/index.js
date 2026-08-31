const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const command = db.command
const { manageRoles } = require('../common/roles')
const activeStatuses = ['paid', 'in_progress', 'pending_checkout']
const supportedStatuses = [
  'pending_payment',
  'paid',
  'checked_in',
  'in_progress',
  'pending_checkout',
  'completed',
  'cancelled',
  'refund_pending',
  'refunded',
]

function fail(code, message) {
  return {
    code,
    message,
    data: null,
  }
}

function pad(value) {
  return `${value}`.padStart(2, '0')
}

function getChinaDateText(date = new Date()) {
  const local = new Date(date.getTime() + 8 * 60 * 60 * 1000)

  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`
}

function normalizeStatus(value) {
  const status = typeof value === 'string' ? value.trim() : 'active'

  if (status === 'all' || status === 'active' || supportedStatuses.includes(status)) {
    return status
  }

  return 'active'
}

function isDateText(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
}

function normalizeDateRange(event) {
  const today = getChinaDateText()
  const startDate = isDateText(event.startDate)
    ? event.startDate.trim()
    : isDateText(event.date)
      ? event.date.trim()
      : today
  const endDate = isDateText(event.endDate) ? event.endDate.trim() : startDate

  if (endDate < startDate) {
    return {
      startDate: endDate,
      endDate: startDate,
    }
  }

  return {
    startDate,
    endDate,
  }
}

function normalizePagination(event) {
  const page = Math.max(Math.floor(Number(event.page || 1)), 1)
  const pageSize = Math.min(Math.max(Math.floor(Number(event.pageSize || 20)), 1), 50)

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  }
}

function getDateRangeBounds(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00+08:00`)
  const endStart = new Date(`${endDate}T00:00:00+08:00`)
  const end = new Date(endStart.getTime() + 24 * 60 * 60 * 1000)

  return {
    start,
    end,
  }
}

function getDateValue(value) {
  if (!value) {
    return 0
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 0 : value.getTime()
  }

  if (typeof value === 'object' && typeof value.toDate === 'function') {
    const date = value.toDate()

    return Number.isNaN(date.getTime()) ? 0 : date.getTime()
  }

  const time = new Date(value).getTime()

  return Number.isNaN(time) ? 0 : time
}

async function getPendingPaymentExpireMinutes() {
  const settingsRes = await db.collection('settings').limit(1).get().catch(() => ({ data: [] }))
  const settings = settingsRes.data[0] || {}

  return Math.max(Math.floor(Number(settings.pendingPaymentExpireMinutes || 1)), 1)
}

function resolvePaymentExpiredAt(order, expireMinutes) {
  const savedExpiredAt = getDateValue(order.paymentExpiredAt)

  if (savedExpiredAt) {
    return savedExpiredAt
  }

  const createdAt = getDateValue(order.createdAt)

  return createdAt ? createdAt + expireMinutes * 60 * 1000 : 0
}

function isDateInRange(dateText, startDate, endDate) {
  return isDateText(dateText) && dateText >= startDate && dateText <= endDate
}

function getDateTextFromValue(value) {
  const time = getDateValue(value)

  if (!time) {
    return ''
  }

  return getChinaDateText(new Date(time))
}

function firstDateText(values) {
  for (const value of values) {
    const dateText = getDateTextFromValue(value)

    if (dateText) {
      return dateText
    }
  }

  return ''
}

function getBusinessDate(order) {
  if (order.slotSnapshot?.date && ['pending_payment', 'paid'].includes(order.status)) {
    return order.slotSnapshot.date
  }

  if (['checked_in', 'in_progress'].includes(order.status)) {
    return firstDateText([order.startedAt, order.checkedInAt, order.createdAt])
  }

  if (order.status === 'pending_checkout') {
    return firstDateText([order.endedAt, order.finishedAt, order.startedAt, order.checkedInAt, order.createdAt])
  }

  if (order.status === 'completed') {
    return firstDateText([order.completedAt, order.finishedAt, order.endedAt, order.startedAt, order.checkedInAt, order.createdAt])
  }

  if (order.status === 'cancelled') {
    return firstDateText([order.cancelledAt, order.updatedAt, order.createdAt])
  }

  if (['refund_pending', 'refunded'].includes(order.status)) {
    return firstDateText([order.refundedAt, order.refundAt, order.updatedAt, order.createdAt])
  }

  if (order.slotSnapshot?.date) {
    return order.slotSnapshot.date
  }

  return firstDateText([order.createdAt, order.updatedAt])
}

function createSummary(orders) {
  const summary = {
    all: orders.length,
    active: 0,
    paid: 0,
    inProgress: 0,
    pendingCheckout: 0,
    completed: 0,
    cancelled: 0,
  }

  orders.forEach((order) => {
    if (activeStatuses.includes(order.status)) {
      summary.active += 1
    }

    if (order.status === 'paid') {
      summary.paid += 1
    }

    if (order.status === 'in_progress') {
      summary.inProgress += 1
    }

    if (order.status === 'pending_checkout') {
      summary.pendingCheckout += 1
    }

    if (order.status === 'completed') {
      summary.completed += 1
    }

    if (order.status === 'cancelled') {
      summary.cancelled += 1
    }
  })

  return summary
}

function filterOrders(orders, status) {
  if (status === 'all') {
    return orders
  }

  if (status === 'active') {
    return orders.filter(order => activeStatuses.includes(order.status))
  }

  return orders.filter(order => order.status === status)
}

function getOrderTimeValue(order) {
  const time = getDateValue(order.startedAt || order.checkedInAt || order.createdAt)

  return Number.isNaN(time) ? 0 : time
}

function sortOrders(orders) {
  const statusPriority = {
    in_progress: 1,
    paid: 2,
    pending_checkout: 3,
    pending_payment: 4,
    completed: 5,
    cancelled: 6,
    refunded: 7,
    refund_pending: 8,
    checked_in: 9,
  }

  return [...orders].sort((a, b) => {
    const priorityDiff = (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99)

    if (priorityDiff !== 0) {
      return priorityDiff
    }

    return getOrderTimeValue(b) - getOrderTimeValue(a)
  })
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
