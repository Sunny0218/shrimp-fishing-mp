const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const command = db.command
const shopSettingsSeedKey = 'default-shop-settings'
const orderStatusTemplateId = 'swMnYem-qmhfPYmL94qIfrFb2Kfws1xT2hjgsN37Pso'
const diagnosticStatuses = ['pending_payment', 'paid', 'checked_in', 'in_progress', 'pending_checkout', 'completed', 'cancelled']

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

function formatDateTimeValue(value) {
  const time = getDateTimeValue(value)

  return time ? new Date(time).toISOString() : ''
}

function getReminderMarkValue(reminders, key) {
  return formatDateTimeValue(reminders?.[key])
}

async function countSubscriptions(where) {
  const res = await db.collection('notification_subscriptions')
    .where(where)
    .count()
    .catch(() => ({ total: 0 }))

  return res.total || 0
}

async function getShopSettings() {
  const collection = db.collection('settings')
  const seededRes = await collection.where({ seedKey: shopSettingsSeedKey }).limit(1).get().catch(() => ({ data: [] }))

  if (seededRes.data[0]) {
    return seededRes.data[0]
  }

  const settingsRes = await collection.limit(1).get().catch(() => ({ data: [] }))

  return settingsRes.data[0] || {}
}

function getReminderSettings(settings) {
  const notificationSettings = settings.notificationSettings || {}

  return {
    customerEnabled: notificationSettings.customerEnabled !== false,
    staffEnabled: notificationSettings.staffEnabled !== false,
    reminderBeforeMinutes: Math.max(Math.floor(Number(notificationSettings.reminderBeforeMinutes || 10)), 1),
  }
}

async function sendOrderNotification(orderId, eventType) {
  const res = await cloud.callFunction({
    name: 'sendOrderNotification',
    data: {
      orderId,
      eventType,
    },
  })

  return res.result?.data || {
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
  }
}

async function sendAndMark(order, eventType, markField) {
  const result = await sendOrderNotification(order._id, eventType)

  if (Number(result.sentCount || 0) > 0) {
    await db.collection('orders').doc(order._id).update({
      data: {
        [markField]: new Date(),
        updatedAt: new Date(),
      },
    })
  }

  return {
    eventType,
    orderId: order._id,
    orderNo: order.orderNo,
    ...result,
  }
}

async function getDebugSnapshot() {
  const [statusCountResults, recentOrdersRes] = await Promise.all([
    Promise.all(diagnosticStatuses.map(async (status) => {
      const res = await db.collection('orders')
        .where({ status })
        .count()
        .catch(() => ({ total: 0 }))

      return {
        status,
        total: res.total || 0,
      }
    })),
    db.collection('orders')
      .where({
        status: command.in(diagnosticStatuses),
      })
      .limit(10)
      .get()
      .catch(() => ({ data: [] })),
  ])

  return {
    statusCounts: statusCountResults.reduce((map, item) => {
      map[item.status] = item.total
      return map
    }, {}),
    recentOrders: recentOrdersRes.data.map(order => ({
      orderId: order._id,
      orderNo: order.orderNo,
      status: order.status,
      orderType: order.orderType || 'package',
      startedAt: formatDateTimeValue(order.startedAt),
      expectedEndedAt: formatDateTimeValue(order.expectedEndedAt),
      completedAt: formatDateTimeValue(order.completedAt),
      updatedAt: formatDateTimeValue(order.updatedAt),
    })),
  }
}

async function buildOrderDebug(order, reminderSettings, now, beforeMilliseconds) {
  const expectedEndedAt = getDateTimeValue(order.expectedEndedAt)
  const reminders = order.reminders || {}
  const isNearEnd = expectedEndedAt ? now >= expectedEndedAt - beforeMilliseconds && now < expectedEndedAt : false
  const isEnded = expectedEndedAt ? now >= expectedEndedAt : false
  const customerSubscriptionBase = {
    openid: order.openid,
    templateId: orderStatusTemplateId,
    target: 'customer',
  }
  const [
    customerExactAcceptedUnused,
    customerLegacyAcceptedUnused,
    customerAcceptedUsed,
    customerSent,
    customerFailed,
    customerRejected,
  ] = await Promise.all([
    countSubscriptions({
      ...customerSubscriptionBase,
      orderId: order._id,
      status: 'accepted',
      used: false,
    }),
    countSubscriptions({
      ...customerSubscriptionBase,
      orderId: '',
      status: 'accepted',
      used: false,
    }),
    countSubscriptions({
      ...customerSubscriptionBase,
      orderId: order._id,
      status: 'accepted',
      used: true,
    }),
    countSubscriptions({
      ...customerSubscriptionBase,
      orderId: order._id,
      status: 'sent',
      used: true,
    }),
    countSubscriptions({
      ...customerSubscriptionBase,
      orderId: order._id,
      status: 'failed',
      used: true,
    }),
    countSubscriptions({
      ...customerSubscriptionBase,
      orderId: order._id,
      status: 'rejected',
    }),
  ])

  return {
    orderId: order._id,
    orderNo: order.orderNo,
    status: order.status,
    orderType: order.orderType || 'package',
    startedAt: formatDateTimeValue(order.startedAt),
    expectedEndedAt: formatDateTimeValue(order.expectedEndedAt),
    now: new Date(now).toISOString(),
    reminderBeforeMinutes: reminderSettings.reminderBeforeMinutes,
    nearEndWindowStart: expectedEndedAt ? new Date(expectedEndedAt - beforeMilliseconds).toISOString() : '',
    isNearEnd,
    isEnded,
    skippedReason: expectedEndedAt
      ? (!isNearEnd && !isEnded ? '未进入提醒窗口' : '')
      : '缺少预计结束时间',
    customerReminderPolicy: '顾客侧保留一次性订阅给已到点提醒，不自动发送快到点提醒',
    customerSubscriptionDiagnostics: {
      orderStatusTemplateId,
      exactAcceptedUnused: customerExactAcceptedUnused,
      legacyAcceptedUnused: customerLegacyAcceptedUnused,
      acceptedUsed: customerAcceptedUsed,
      sent: customerSent,
      failed: customerFailed,
      rejected: customerRejected,
    },
    reminderMarks: {
      customerNearEndSentAt: getReminderMarkValue(reminders, 'customerNearEndSentAt'),
      staffNearEndSentAt: getReminderMarkValue(reminders, 'staffNearEndSentAt'),
      customerEndedSentAt: getReminderMarkValue(reminders, 'customerEndedSentAt'),
      staffEndedSentAt: getReminderMarkValue(reminders, 'staffEndedSentAt'),
    },
  }
}

exports.main = async (event = {}) => {
  try {
    const debug = event.debug !== false
    const settings = await getShopSettings()
    const reminderSettings = getReminderSettings(settings)
    const now = Date.now()
    const beforeMilliseconds = reminderSettings.reminderBeforeMinutes * 60 * 1000
    const ordersRes = await db.collection('orders')
      .where({ status: 'in_progress' })
      .limit(100)
      .get()
    const tasks = []
    const orderDiagnostics = []

    for (const order of ordersRes.data) {
      const expectedEndedAt = getDateTimeValue(order.expectedEndedAt)
      const orderDebug = debug ? await buildOrderDebug(order, reminderSettings, now, beforeMilliseconds) : null

      if (orderDebug) {
        orderDiagnostics.push(orderDebug)
      }

      if (!expectedEndedAt) {
        continue
      }

      const reminders = order.reminders || {}
      const isNearEnd = now >= expectedEndedAt - beforeMilliseconds && now < expectedEndedAt
      const isEnded = now >= expectedEndedAt

      if (isEnded) {
        if (reminderSettings.customerEnabled && !reminders.customerEndedSentAt) {
          const task = sendAndMark(order, 'customer_ended', 'reminders.customerEndedSentAt')
          tasks.push(task)
        }

        if (reminderSettings.staffEnabled && !reminders.staffEndedSentAt) {
          const task = sendAndMark(order, 'staff_ended', 'reminders.staffEndedSentAt')
          tasks.push(task)
        }
      }
      else if (isNearEnd) {
        if (reminderSettings.staffEnabled && !reminders.staffNearEndSentAt) {
          const task = sendAndMark(order, 'staff_near_end', 'reminders.staffNearEndSentAt')
          tasks.push(task)
        }
      }
    }

    const results = await Promise.all(tasks)
    const data = {
      scannedCount: ordersRes.data.length,
      triggeredCount: results.length,
      sentCount: results.reduce((total, item) => total + Number(item.sentCount || 0), 0),
      failedCount: results.reduce((total, item) => total + Number(item.failedCount || 0), 0),
      skippedCount: results.reduce((total, item) => total + Number(item.skippedCount || 0), 0),
      results,
    }

    if (debug) {
      data.debug = {
        now: new Date(now).toISOString(),
        reminderSettings,
        scannedOrders: orderDiagnostics,
        snapshot: await getDebugSnapshot(),
      }
    }

    return {
      code: 0,
      message: 'ok',
      data,
    }
  }
  catch (error) {
    return fail(500, error.message || '扫描订单提醒失败')
  }
}
