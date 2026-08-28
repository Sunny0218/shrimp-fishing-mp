const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const command = db.command
const manageRoles = ['staff', 'admin', 'super_admin']
const shopSettingsSeedKey = 'default-shop-settings'
const notificationTemplateConfig = {
  reservationNotice: {
    templateId: '8O7iDjllM5Yi1TBFTaxwwubW9kuNbr77rtbOQnjeaSc',
    fields: {
      customerName: 'name1',
      appointmentTime: 'date3',
      appointmentItem: 'thing13',
      appointmentStatus: 'phrase14',
      remark: 'thing8',
    },
  },
  orderStatus: {
    templateId: 'swMnYem-qmhfPYmL94qIfrFb2Kfws1xT2hjgsN37Pso',
    fields: {
      orderNo: 'character_string6',
      orderStatus: 'phrase2',
      orderAmount: 'amount40',
      updatedAt: 'time20',
      remark: 'thing5',
    },
  },
}
const eventConfigMap = {
  customer_started: {
    target: 'customer',
    templateKey: 'orderStatus',
    statusText: '开始计时',
    remark: '已开始计时，请留意结束时间',
  },
  customer_near_end: {
    target: 'customer',
    templateKey: 'orderStatus',
    statusText: '即将到点',
    remark: '请留意剩余时间',
  },
  customer_ended: {
    target: 'customer',
    templateKey: 'orderStatus',
    statusText: '已到点',
    remark: '请联系服务员处理',
  },
  customer_pending_checkout: {
    target: 'customer',
    templateKey: 'orderStatus',
    statusText: '待结账',
    remark: '请打开小程序支付',
  },
  customer_completed: {
    target: 'customer',
    templateKey: 'orderStatus',
    statusText: '已完成',
    remark: '感谢到店体验',
  },
  staff_near_end: {
    target: 'staff',
    templateKey: 'orderStatus',
    statusText: '顾客即将到点',
    remark: '请及时提醒顾客',
  },
  staff_ended: {
    target: 'staff',
    templateKey: 'orderStatus',
    statusText: '顾客已到点',
    remark: '请跟进结束或续时',
  },
  staff_pending_checkout: {
    target: 'staff',
    templateKey: 'orderStatus',
    statusText: '待顾客结账',
    remark: '请提醒顾客支付',
  },
}

function fail(code, message) {
  return {
    code,
    message,
    data: null,
  }
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
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

function formatDateTime(value) {
  const time = getDateTimeValue(value)

  if (!time) {
    return ''
  }

  const date = new Date(time + 8 * 60 * 60 * 1000)
  const pad = num => `${num}`.padStart(2, '0')

  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日 ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
}

function formatAmount(amount) {
  return `${((Number(amount) || 0) / 100).toFixed(2)}元`
}

function truncateText(value, maxLength = 20) {
  const text = normalizeString(value)

  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function isRetryableSendError(error, message) {
  const errCode = error?.errCode || error?.code
  const text = message || error?.errMsg || error?.message || ''

  return errCode === -501001
    || text.includes('-501001')
    || text.includes('INVALID_WX_ACCESS_TOKEN')
    || text.includes('invalid wx openapi access_token')
    || text.includes('resource system error')
}

function getOrderItemName(order) {
  if (order.orderType === 'metered') {
    return order.pricingRuleSnapshot?.name || '现场计时'
  }

  return order.packageSnapshot?.name || '套餐预约'
}

function getOrderAmount(order, config) {
  if (config.statusText === '待结账') {
    return Number(order.checkoutAmount || 0)
  }

  return Number(order.finalAmount || order.paidAmount || order.baseAmount || 0)
}

function buildMessageData(order, config) {
  if (config.templateKey === 'reservationNotice') {
    const appointmentTime = order.expectedEndedAt || order.startedAt || order.checkedInAt || order.createdAt

    return {
      name1: { value: truncateText(order.customerName || '顾客', 10) },
      date3: { value: formatDateTime(appointmentTime) || formatDateTime(new Date()) },
      thing13: { value: truncateText(getOrderItemName(order), 20) },
      phrase14: { value: truncateText(config.statusText, 10) },
      thing8: { value: truncateText(config.remark, 20) },
    }
  }

  return {
    character_string6: { value: truncateText(order.dailyNo || order.orderNo, 32) },
    phrase2: { value: truncateText(config.statusText, 10) },
    amount40: { value: formatAmount(getOrderAmount(order, config)) },
    time20: { value: formatDateTime(new Date()) },
    thing5: { value: truncateText(config.remark, 20) },
  }
}

async function getCurrentUser(openid) {
  if (!openid) {
    return null
  }

  const userRes = await db.collection('users').where({ openid }).limit(1).get()

  return userRes.data[0] || null
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

function isNotificationTargetEnabled(settings, target) {
  const notificationSettings = settings.notificationSettings || {}

  if (target === 'staff') {
    return notificationSettings.staffEnabled !== false
  }

  return notificationSettings.customerEnabled !== false
}

function canSendByCurrentUser(user, order, config) {
  if (!user) {
    return true
  }

  if (manageRoles.includes(user.role)) {
    return true
  }

  if (config.target === 'staff') {
    return false
  }

  return order.openid === user.openid
}

async function getRecipientOpenids(order, config) {
  if (config.target === 'customer') {
    return [order.openid].filter(Boolean)
  }

  const usersRes = await db.collection('users')
    .where({
      role: command.in(manageRoles),
      status: command.neq('disabled'),
    })
    .limit(50)
    .get()

  return usersRes.data.map(item => item.openid).filter(Boolean)
}

async function getSubscription(openid, templateId, target, orderId) {
  const exactRes = await db.collection('notification_subscriptions')
    .where({
      openid,
      templateId,
      target,
      orderId,
      status: 'accepted',
      used: false,
    })
    .limit(1)
    .get()

  if (exactRes.data[0]) {
    return exactRes.data[0]
  }

  const failedRes = await db.collection('notification_subscriptions')
    .where({
      openid,
      templateId,
      target,
      orderId,
      status: 'failed',
      used: true,
    })
    .limit(10)
    .get()
    .catch(() => ({ data: [] }))
  const retryableFailedSubscription = failedRes.data.find(item => isRetryableSendError({}, item.failMessage || item.lastFailMessage || ''))

  if (retryableFailedSubscription) {
    return retryableFailedSubscription
  }

  const res = await db.collection('notification_subscriptions')
    .where({
      openid,
      templateId,
      target,
      orderId: '',
      status: 'accepted',
      used: false,
    })
    .limit(1)
    .get()

  return res.data[0] || null
}

async function markSubscription(subscriptionId, data) {
  await db.collection('notification_subscriptions').doc(subscriptionId).update({
    data: {
      ...data,
      updatedAt: new Date(),
    },
  })
}

async function writeNotificationLog(logData) {
  try {
    await db.collection('notification_logs').add({
      data: {
        ...logData,
        createdAt: new Date(),
      },
    })
  }
  catch (error) {
    console.warn('[sendOrderNotification] write log failed', error)
  }
}

async function sendToRecipient(order, eventType, config, recipientOpenid) {
  const template = notificationTemplateConfig[config.templateKey]
  const subscription = await getSubscription(recipientOpenid, template.templateId, config.target, order._id)

  if (!subscription) {
    const result = {
      openid: recipientOpenid,
      status: 'skipped',
      message: '没有可用订阅授权',
    }

    await writeNotificationLog({
      orderId: order._id,
      orderNo: order.orderNo,
      eventType,
      target: config.target,
      templateKey: config.templateKey,
      templateId: template.templateId,
      recipientOpenid,
      sendStatus: result.status,
      message: result.message,
    })

    return result
  }

  try {
    let sendRes
    let lastError

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        sendRes = await cloud.openapi.subscribeMessage.send({
          touser: recipientOpenid,
          templateId: template.templateId,
          page: `pages/orders/detail?id=${order._id}`,
          data: buildMessageData(order, config),
          miniprogramState: 'developer',
          lang: 'zh_CN',
        })
        if (sendRes?.errCode && sendRes.errCode !== 0) {
          throw new Error(sendRes.errMsg || `订阅消息发送失败：${sendRes.errCode}`)
        }
        lastError = null
        break
      }
      catch (error) {
        const message = error.message || error.errMsg || '订阅消息发送失败'
        lastError = error

        if (attempt >= 2 || !isRetryableSendError(error, message)) {
          throw error
        }

        await sleep(300)
      }
    }

    if (lastError) {
      throw lastError
    }

    await markSubscription(subscription._id, {
      status: 'sent',
      used: true,
      usedAt: new Date(),
      eventType,
      orderId: order._id,
      orderNo: order.orderNo,
    })

    const result = {
      openid: recipientOpenid,
      status: 'sent',
    }

    await writeNotificationLog({
      orderId: order._id,
      orderNo: order.orderNo,
      eventType,
      target: config.target,
      templateKey: config.templateKey,
      templateId: template.templateId,
      subscriptionId: subscription._id,
      recipientOpenid,
      sendStatus: result.status,
    })

    return result
  }
  catch (error) {
    const message = error.message || '订阅消息发送失败'
    const retryable = isRetryableSendError(error, message)

    if (retryable) {
      await markSubscription(subscription._id, {
        status: 'accepted',
        used: false,
        lastFailedAt: new Date(),
        lastFailMessage: message,
        lastFailedEventType: eventType,
        failedAttempts: command.inc(1),
      })
    }
    else {
      await markSubscription(subscription._id, {
        status: 'failed',
        used: true,
        failedAt: new Date(),
        failMessage: message,
        eventType,
        orderId: order._id,
        orderNo: order.orderNo,
      })
    }

    const result = {
      openid: recipientOpenid,
      status: 'failed',
      retryable,
      message,
    }

    await writeNotificationLog({
      orderId: order._id,
      orderNo: order.orderNo,
      eventType,
      target: config.target,
      templateKey: config.templateKey,
      templateId: template.templateId,
      subscriptionId: subscription._id,
      recipientOpenid,
      sendStatus: result.status,
      message,
    })

    return result
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const orderId = normalizeString(event.orderId)
  const eventType = normalizeString(event.eventType)
  const config = eventConfigMap[eventType]

  if (!orderId) {
    return fail(400, '缺少订单 ID')
  }

  if (!config) {
    return fail(400, '提醒类型不存在')
  }

  try {
    const orderRes = await db.collection('orders').doc(orderId).get()
    const order = orderRes.data

    if (!order) {
      return fail(404, '订单不存在')
    }

    const currentUser = await getCurrentUser(openid)

    if (!canSendByCurrentUser(currentUser, order, config)) {
      return fail(403, '无权限发送该订单提醒')
    }

    const settings = await getShopSettings()

    if (!isNotificationTargetEnabled(settings, config.target)) {
      return {
        code: 0,
        message: 'ok',
        data: {
          eventType,
          sentCount: 0,
          skippedCount: 0,
          failedCount: 0,
          results: [],
        },
      }
    }

    const recipients = await getRecipientOpenids(order, config)
    const uniqueRecipients = recipients.filter((item, index, list) => list.indexOf(item) === index)
    const results = await Promise.all(uniqueRecipients.map(recipientOpenid => sendToRecipient(order, eventType, config, recipientOpenid)))

    return {
      code: 0,
      message: 'ok',
      data: {
        eventType,
        sentCount: results.filter(item => item.status === 'sent').length,
        skippedCount: results.filter(item => item.status === 'skipped').length,
        failedCount: results.filter(item => item.status === 'failed').length,
        results,
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '发送订单提醒失败')
  }
}
