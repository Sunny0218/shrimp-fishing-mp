const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const { shopEditRoles } = require('../common/roles')
const validBookingModes = ['walk_in', 'slot']
const validPaymentModes = ['mock_auto_paid', 'mock_pending_payment']
const shopSettingsSeedKey = 'default-shop-settings'
const notificationTemplateConfig = {
  reservationNotice: {
    templateId: '8O7iDjllM5Yi1TBFTaxwwubW9kuNbr77rtbOQnjeaSc',
    title: '预约通知',
    scene: 'reservation_notice',
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
    title: '订单状态提醒',
    scene: 'order_status',
    fields: {
      orderNo: 'character_string6',
      orderStatus: 'phrase2',
      orderAmount: 'amount40',
      updatedAt: 'time20',
      remark: 'thing5',
    },
  },
}
const defaultNotificationSettings = {
  customerEnabled: true,
  staffEnabled: true,
  reminderBeforeMinutes: 10,
  templates: notificationTemplateConfig,
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

function normalizeCoverImages(images) {
  if (!Array.isArray(images)) {
    return []
  }

  return images
    .map(normalizeString)
    .filter(Boolean)
    .slice(0, 3)
}

function getRemovedCoverImageFileIDs(previousImages, nextImages) {
  const nextImageSet = new Set(normalizeCoverImages(nextImages))

  return normalizeCoverImages(previousImages)
    .filter(fileID => fileID.startsWith('cloud://') && !nextImageSet.has(fileID))
    .filter((fileID, index, list) => list.indexOf(fileID) === index)
}

async function deleteRemovedCoverImages(fileList) {
  if (!fileList.length) {
    return []
  }

  try {
    const res = await cloud.deleteFile({ fileList })

    return res.fileList || []
  }
  catch (error) {
    console.warn('[saveShopSettings] delete removed cover images failed', error)

    return []
  }
}

function normalizeNotificationSettings(settings) {
  const reminderBeforeMinutes = Math.max(Math.floor(Number(settings?.reminderBeforeMinutes || defaultNotificationSettings.reminderBeforeMinutes)), 1)

  return {
    customerEnabled: settings?.customerEnabled !== false,
    staffEnabled: settings?.staffEnabled !== false,
    reminderBeforeMinutes,
    templates: notificationTemplateConfig,
  }
}

function normalizeSettings(event) {
  const shopName = normalizeString(event.shopName)
  const address = normalizeString(event.address)
  const phone = normalizeString(event.phone)
  const notice = normalizeString(event.notice)
  const coverImages = normalizeCoverImages(event.coverImages)
  const notificationSettings = normalizeNotificationSettings(event.notificationSettings)
  const bookingMode = validBookingModes.includes(event.bookingMode) ? event.bookingMode : 'walk_in'
  const paymentMode = validPaymentModes.includes(event.paymentMode) ? event.paymentMode : 'mock_auto_paid'
  const pendingPaymentExpireMinutes = Math.max(Math.floor(Number(event.pendingPaymentExpireMinutes || 1)), 0)
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

  if (!Number.isFinite(pendingPaymentExpireMinutes) || pendingPaymentExpireMinutes <= 0) {
    return { error: '请填写有效待支付保留时间' }
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
      coverImages,
      businessHours,
      notice,
      bookingMode,
      paymentMode,
      pendingPaymentExpireMinutes,
      notificationSettings,
    },
  }
}

async function getCurrentSettings(settingsCollection) {
  const seededRes = await settingsCollection.where({ seedKey: shopSettingsSeedKey }).limit(1).get()

  if (seededRes.data[0]) {
    return seededRes.data[0]
  }

  const settingsRes = await settingsCollection.limit(1).get()

  return settingsRes.data[0]
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

    if (!shopEditRoles.includes(user.role)) {
      return fail(403, '无权限保存门店信息')
    }

    const now = new Date()
    const settingsCollection = db.collection('settings')
    const currentSettings = await getCurrentSettings(settingsCollection)
    const payload = {
      ...normalized.data,
      seedKey: currentSettings?.seedKey || shopSettingsSeedKey,
      updatedAt: now,
      updatedBy: openid,
    }

    if (currentSettings?._id) {
      const removedCoverImages = getRemovedCoverImageFileIDs(currentSettings.coverImages, payload.coverImages)

      await settingsCollection.doc(currentSettings._id).update({
        data: payload,
      })

      const deletedCoverImages = await deleteRemovedCoverImages(removedCoverImages)
      const updatedRes = await settingsCollection.doc(currentSettings._id).get()

      return {
        code: 0,
        message: 'ok',
        data: {
          settings: updatedRes.data,
          deletedCoverImages,
        },
      }
    }

    const addRes = await settingsCollection.add({
      data: {
        ...payload,
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
