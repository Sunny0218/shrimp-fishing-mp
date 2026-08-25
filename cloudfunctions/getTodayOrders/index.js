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

function getDateRange(dateText) {
  const start = new Date(`${dateText}T00:00:00+08:00`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  return {
    start,
    end,
  }
}

function normalizeStatus(value) {
  const status = typeof value === 'string' ? value.trim() : 'active'

  if (status === 'all' || status === 'active' || supportedStatuses.includes(status)) {
    return status
  }

  return 'active'
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
  const time = new Date(order.startedAt || order.checkedInAt || order.createdAt || 0).getTime()

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
    return fail(401, '请先登录后再查看今日订单')
  }

  const dateText = typeof event.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.date.trim())
    ? event.date.trim()
    : getChinaDateText()
  const status = normalizeStatus(event.status)
  const { start, end } = getDateRange(dateText)

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get()
    const user = userRes.data[0]

    if (!user || user.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    if (!manageRoles.includes(user.role)) {
      return fail(403, '无权限查看今日订单')
    }

    const [createdRes, slotRes, activeRes] = await Promise.all([
      db.collection('orders')
        .where({
          createdAt: command.gte(start).and(command.lt(end)),
        })
        .limit(100)
        .get(),
      db.collection('orders')
        .where({
          'slotSnapshot.date': dateText,
        })
        .limit(100)
        .get()
        .catch(() => ({ data: [] })),
      db.collection('orders')
        .where({
          status: command.in(activeStatuses),
        })
        .limit(100)
        .get(),
    ])
    const orderMap = new Map()

    const activeOrders = activeRes.data.filter((order) => {
      if (!order.slotSnapshot?.date) {
        return true
      }

      return order.slotSnapshot.date === dateText
    })

    createdRes.data.concat(slotRes.data, activeOrders).forEach((order) => {
      if (order?._id) {
        orderMap.set(order._id, order)
      }
    })

    const allOrders = sortOrders([...orderMap.values()])
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
        serverTime: new Date().toISOString(),
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '今日订单获取失败')
  }
}
