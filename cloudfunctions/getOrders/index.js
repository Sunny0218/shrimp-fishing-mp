const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const command = db.command
const manageRoles = ['staff', 'admin', 'super_admin']
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

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return fail(401, '请先登录后再查看门店订单')
  }

  const status = normalizeStatus(event.status)
  const { startDate, endDate } = normalizeDateRange(event)
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
    ].map(where => db.collection('orders').where(where).limit(100).get().catch(() => ({ data: [] })))
    const orderResList = await Promise.all(queryTasks)
    const orderMap = new Map()

    orderResList.flatMap(res => res.data).forEach((order) => {
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

    return {
      code: 0,
      message: 'ok',
      data: {
        rows,
        total: rows.length,
        summary,
        date: dateText,
        startDate,
        endDate,
        serverTime: new Date().toISOString(),
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '门店订单获取失败')
  }
}
