const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const editRoles = ['admin', 'super_admin']
const validBookingModes = ['walk_in', 'slot']
const validPaymentModes = ['mock_auto_paid', 'mock_pending_payment']

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

function isValidTime(value) {
  if (value === '24:00') {
    return true
  }

  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function normalizeBusinessHours(hours) {
  if (!Array.isArray(hours)) {
    return []
  }

  return hours
    .map(item => ({
      label: normalizeString(item?.label) || '营业',
      startTime: normalizeString(item?.startTime),
      endTime: normalizeString(item?.endTime),
    }))
    .filter(item => item.startTime && item.endTime)
}

function normalizeSettings(event) {
  const shopName = normalizeString(event.shopName)
  const address = normalizeString(event.address)
  const phone = normalizeString(event.phone)
  const notice = normalizeString(event.notice)
  const bookingMode = validBookingModes.includes(event.bookingMode) ? event.bookingMode : 'walk_in'
  const paymentMode = validPaymentModes.includes(event.paymentMode) ? event.paymentMode : 'mock_auto_paid'
  const businessHours = normalizeBusinessHours(event.businessHours)

  if (!shopName) {
    return { error: '请填写门店名称' }
  }

  if (!address) {
    return { error: '请填写门店地址' }
  }

  if (phone.length > 30) {
    return { error: '联系电话不能超过 30 个字符' }
  }

  if (!businessHours.length) {
    return { error: '请至少填写一条营业时间' }
  }

  const invalidHour = businessHours.find(item => !isValidTime(item.startTime) || !isValidTime(item.endTime))

  if (invalidHour) {
    return { error: '营业时间格式不正确' }
  }

  return {
    data: {
      shopName,
      address,
      phone,
      businessHours,
      notice,
      bookingMode,
      paymentMode,
    },
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return fail(401, '请先登录后再保存门店信息')
  }

  const normalized = normalizeSettings(event)

  if (normalized.error) {
    return fail(400, normalized.error)
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get()
    const user = userRes.data[0]

    if (!user || user.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    if (!editRoles.includes(user.role)) {
      return fail(403, '无权限保存门店信息')
    }

    const now = new Date()
    const settingsCollection = db.collection('settings')
    const settingsRes = await settingsCollection.limit(1).get()
    const currentSettings = settingsRes.data[0]
    const payload = {
      ...normalized.data,
      updatedAt: now,
      updatedBy: openid,
    }

    if (currentSettings?._id) {
      await settingsCollection.doc(currentSettings._id).update({
        data: payload,
      })

      const updatedRes = await settingsCollection.doc(currentSettings._id).get()

      return {
        code: 0,
        message: 'ok',
        data: {
          settings: updatedRes.data,
        },
      }
    }

    const addRes = await settingsCollection.add({
      data: {
        ...payload,
        coverImages: [],
        createdAt: now,
        createdBy: openid,
      },
    })
    const createdRes = await settingsCollection.doc(addRes._id).get()

    return {
      code: 0,
      message: 'ok',
      data: {
        settings: createdRes.data,
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '门店信息保存失败')
  }
}
