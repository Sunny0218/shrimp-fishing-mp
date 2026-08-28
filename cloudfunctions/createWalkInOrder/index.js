const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const { createMockPaidPayment } = require('./paymentService')

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

function createOrderNo() {
  const now = new Date()
  const dateText = [
    now.getFullYear(),
    `${now.getMonth() + 1}`.padStart(2, '0'),
    `${now.getDate()}`.padStart(2, '0'),
  ].join('')
  const timeText = [
    `${now.getHours()}`.padStart(2, '0'),
    `${now.getMinutes()}`.padStart(2, '0'),
    `${now.getSeconds()}`.padStart(2, '0'),
  ].join('')
  const randomText = Math.random().toString(36).slice(2, 6).toUpperCase()

  return `XC${dateText}${timeText}${randomText}`
}

function createRandomCheckinCode() {
  return `${Math.floor(10000000 + Math.random() * 90000000)}`
}

function normalizeCount(value, defaultValue = 1) {
  const count = Number(value)

  if (!Number.isFinite(count)) {
    return defaultValue
  }

  return Math.min(Math.max(Math.floor(count), defaultValue), 20)
}

async function getPaymentSettings() {
  const settingsRes = await db.collection('settings').limit(1).get().catch(() => ({ data: [] }))
  const settings = settingsRes.data[0] || {}
  const paymentMode = settings.paymentMode === 'mock_pending_payment' ? 'mock_pending_payment' : 'mock_auto_paid'
  const pendingPaymentExpireMinutes = Math.max(Math.floor(Number(settings.pendingPaymentExpireMinutes || 1)), 1)

  return {
    paymentMode,
    pendingPaymentExpireMinutes,
  }
}

async function createUniqueCheckinCode() {
  const maxRetryCount = 10

  for (let index = 0; index < maxRetryCount; index += 1) {
    const checkinCode = createRandomCheckinCode()
    const existingRes = await db.collection('orders')
      .where({
        checkinCode,
        status: 'paid',
      })
      .limit(1)
      .get()

    if (!existingRes.data.length) {
      return checkinCode
    }
  }

  throw new Error('开始计时码生成失败，请重试')
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const customerPhone = normalizeString(event.customerPhone)
  const rodCount = normalizeCount(event.rodCount)
  const remark = normalizeString(event.remark)

  if (!openid) {
    return fail(401, '请先登录后再现场开单')
  }

  if (customerPhone.length > 30) {
    return fail(400, '顾客手机号不能超过 30 个字符')
  }

  try {
    const [userRes, pricingRuleRes] = await Promise.all([
      db.collection('users').where({ openid }).limit(1).get(),
      db.collection('pricing_rules').where({ status: 'active' }).orderBy('sort', 'asc').limit(1).get(),
    ])
    const user = userRes.data[0]
    const pricingRule = pricingRuleRes.data[0]

    if (!user || user.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    if (!pricingRule) {
      return fail(404, '门店暂未配置现场计费规则')
    }

    const pricePerHour = Number(pricingRule.pricePerHour || 0)
    const firstHourAmount = Number(pricingRule.firstHourAmount || pricePerHour)
    const extraPricePerHour = Number(pricingRule.extraPricePerHour || pricePerHour)
    const minimumMinutes = Number(pricingRule.minimumMinutes || 0)
    const unitMinutes = Number(pricingRule.unitMinutes || 60)

    if (firstHourAmount <= 0 || extraPricePerHour <= 0 || unitMinutes <= 0) {
      return fail(400, '现场计费规则配置异常')
    }

    const now = new Date()
    const paymentSettings = await getPaymentSettings()
    const isPendingPaymentMode = paymentSettings.paymentMode === 'mock_pending_payment'
    const orderStatus = isPendingPaymentMode ? 'pending_payment' : 'paid'
    const paymentExpiredAt = isPendingPaymentMode
      ? new Date(now.getTime() + paymentSettings.pendingPaymentExpireMinutes * 60 * 1000)
      : null
    const orderNo = createOrderNo()
    const checkinCode = isPendingPaymentMode ? '' : await createUniqueCheckinCode()
    const baseAmount = firstHourAmount * rodCount
    const rodSessions = Array.from({ length: rodCount }, (_, index) => ({
      id: `rod_${index + 1}`,
      label: `${index + 1}号杆`,
      status: 'pending',
      startedAt: null,
      stoppedAt: null,
      endedAt: null,
      actualDurationMinutes: 0,
      chargedMinutes: 0,
      amount: firstHourAmount,
      paidAmount: isPendingPaymentMode ? 0 : firstHourAmount,
      checkoutAmount: 0,
    }))
    const orderData = {
      orderNo,
      userId: user._id,
      openid,
      customerPhone: customerPhone || user.phone || '',
      orderType: 'metered',
      orderSource: 'walk_in',
      bookingMode: 'walk_in',
      status: orderStatus,
      packageId: '',
      pricingRuleId: pricingRule._id,
      rodCount,
      rodSessions,
      peopleCount: 1,
      pricingRuleSnapshot: {
        pricingRuleId: pricingRule._id,
        name: pricingRule.name || '现场计时标准价',
        pricePerHour: pricePerHour > 0 ? pricePerHour : firstHourAmount,
        firstHourAmount,
        extraPricePerHour,
        minimumMinutes,
        unitMinutes,
      },
      baseAmount,
      goodsAmount: 0,
      adjustAmount: 0,
      discountAmount: 0,
      overtimeAmount: 0,
      checkoutAmount: 0,
      waivedOvertimeAmount: 0,
      paidAmount: isPendingPaymentMode ? 0 : baseAmount,
      finalAmount: baseAmount,
      remark,
      adminRemark: '',
      checkinCode,
      paymentExpiredAt,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    }

    const result = await db.runTransaction(async (transaction) => {
      const orderRes = await transaction.collection('orders').add({
        data: orderData,
      })

      if (isPendingPaymentMode) {
        return {
          orderRes,
          payment: null,
        }
      }

      const payment = await createMockPaidPayment(transaction, {
        order: orderData,
        orderId: orderRes._id,
        userId: user._id,
        openid,
        amount: baseAmount,
        type: 'order',
        now,
      })

      return {
        orderRes,
        payment,
      }
    })

    const responseData = {
      orderId: result.orderRes._id,
      orderNo,
      status: orderData.status,
      ...(checkinCode ? { checkinCode } : {}),
      pricingRule: {
        _id: pricingRule._id,
        name: pricingRule.name || '现场计时标准价',
        description: pricingRule.description || '',
        pricePerHour: pricePerHour > 0 ? pricePerHour : firstHourAmount,
        firstHourAmount,
        extraPricePerHour,
        minimumMinutes,
        unitMinutes,
        status: pricingRule.status || 'active',
        sort: pricingRule.sort || 0,
      },
    }

    if (result.payment) {
      responseData.payment = {
        _id: result.payment._id,
        paymentNo: result.payment.paymentNo,
        amount: result.payment.amount,
        type: result.payment.type,
        status: result.payment.status,
        paidAt: result.payment.paidAt,
      }
    }

    return {
      code: 0,
      message: 'ok',
      data: responseData,
    }
  }
  catch (error) {
    return fail(500, error.message || '现场开单失败')
  }
}
