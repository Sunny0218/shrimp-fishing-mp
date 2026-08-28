const cloud = require('wx-server-sdk')
const collectionsConfig = require('./collections.json')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const debugVersion = 'initDatabase-real-seed-20260825'
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

function getDateText(date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

function addDays(date, days) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + days)

  return nextDate
}

async function createCollectionIfNeeded(name) {
  try {
    await db.createCollection(name)
    return {
      name,
      status: 'created',
    }
  }
  catch (error) {
    const message = error && error.message ? error.message : String(error)
    const code = error && error.errCode ? error.errCode : error && error.code
    const codeText = code ? String(code) : ''

    if (
      code === -502005
      || code === 'DATABASE_COLLECTION_ALREADY_EXISTS'
      || codeText.includes('AlreadyExists')
      || message.includes('AlreadyExists')
      || message.includes('already exists')
      || message.includes('already exist')
      || message.includes('collection exists')
      || message.includes('同名集合')
      || message.includes('已存在')
    ) {
      return {
        name,
        status: 'exists',
      }
    }

    return {
      name,
      status: 'failed',
      message,
      code,
    }
  }
}

async function upsertBySeedKey(collectionName, seedKey, data) {
  try {
    const collection = db.collection(collectionName)
    const now = new Date()
    const existingRes = await collection.where({ seedKey }).limit(1).get()
    const existing = existingRes.data[0]
    const payload = {
      ...data,
      seedKey,
      updatedAt: now,
    }

    if (existing) {
      if (collectionName === 'time_slots') {
        payload.bookedCount = Number(existing.bookedCount || 0)
        payload.status = existing.status || payload.status
      }

      await collection.doc(existing._id).update({
        data: payload,
      })

      return {
        collection: collectionName,
        seedKey,
        id: existing._id,
        status: 'updated',
      }
    }

    const addRes = await collection.add({
      data: {
        ...payload,
        createdAt: now,
      },
    })

    return {
      collection: collectionName,
      seedKey,
      id: addRes._id,
      status: 'created',
    }
  }
  catch (error) {
    return {
      collection: collectionName,
      seedKey,
      status: 'failed',
      message: error && error.message ? error.message : String(error),
      code: error && (error.errCode || error.code),
    }
  }
}

async function upsertShopSettings() {
  try {
    const collection = db.collection('settings')
    const now = new Date()
    const settingsData = {
      shopName: '钓虾乐园',
      address: '深圳市南山区欢乐海岸钓虾场',
      phone: '13800138000',
      businessHours: [
        {
          label: '周一至周五',
          startTime: '14:00',
          endTime: '23:00',
        },
        {
          label: '周末及节假日',
          startTime: '10:00',
          endTime: '24:00',
        },
      ],
      coverImages: [],
      notice: '测试数据已开放预约。到店后出示订单核销码，由服务员核销并开始计时。',
      bookingMode: 'walk_in',
      paymentMode: 'mock_auto_paid',
      pendingPaymentExpireMinutes: 1,
      notificationSettings: {
        customerEnabled: true,
        staffEnabled: true,
        reminderBeforeMinutes: 10,
        templates: notificationTemplateConfig,
      },
      location: {
        latitude: 22.5328,
        longitude: 113.9887,
        address: '深圳市南山区欢乐海岸钓虾场',
      },
      seedKey: 'default-shop-settings',
      updatedAt: now,
    }

    const seededRes = await collection.where({ seedKey: settingsData.seedKey }).limit(1).get()
    const seededSettings = seededRes.data[0]

    if (seededSettings) {
      await collection.doc(seededSettings._id).update({
        data: settingsData,
      })

      return {
        collection: 'settings',
        seedKey: settingsData.seedKey,
        id: seededSettings._id,
        status: 'updated',
      }
    }

    const settingsRes = await collection.limit(1).get()
    const existingSettings = settingsRes.data[0]

    if (existingSettings) {
      await collection.doc(existingSettings._id).update({
        data: settingsData,
      })

      return {
        collection: 'settings',
        seedKey: settingsData.seedKey,
        id: existingSettings._id,
        status: 'updated',
      }
    }

    const addRes = await collection.add({
      data: {
        ...settingsData,
        createdAt: now,
      },
    })

    return {
      collection: 'settings',
      seedKey: settingsData.seedKey,
      id: addRes._id,
      status: 'created',
    }
  }
  catch (error) {
    return {
      collection: 'settings',
      seedKey: 'default-shop-settings',
      status: 'failed',
      message: error && error.message ? error.message : String(error),
      code: error && (error.errCode || error.code),
    }
  }
}

async function upsertDemoPackages() {
  const packages = [
    {
      seedKey: 'demo-package-5min',
      data: {
        name: '测试 5 分钟套餐',
        description: '用于快速测试核销计时、超时补款和待结账流程。',
        durationMinutes: 5,
        price: 100,
        rodCount: 1,
        maxPeople: 1,
        status: 'active',
        sort: 0,
      },
    },
    {
      seedKey: 'demo-package-2h',
      data: {
        name: '双人畅钓 2 小时',
        description: '适合新手体验，含 2 支虾竿和基础饵料。',
        durationMinutes: 120,
        price: 12800,
        rodCount: 2,
        maxPeople: 2,
        status: 'active',
        sort: 1,
      },
    },
    {
      seedKey: 'demo-package-3h',
      data: {
        name: '好友局 3 小时',
        description: '适合 3-4 人同行，含 3 支虾竿。',
        durationMinutes: 180,
        price: 18800,
        rodCount: 3,
        maxPeople: 4,
        status: 'active',
        sort: 2,
      },
    },
    {
      seedKey: 'demo-package-night',
      data: {
        name: '夜钓放松套餐',
        description: '晚间人气场次，含 2 支虾竿和夜场座位。',
        durationMinutes: 150,
        price: 16800,
        rodCount: 2,
        maxPeople: 3,
        status: 'active',
        sort: 3,
      },
    },
  ]

  return Promise.all(packages.map(item => upsertBySeedKey('packages', item.seedKey, item.data)))
}

async function upsertDemoTimeSlots() {
  const today = new Date()
  const slotTemplates = [
    {
      startTime: '14:00',
      endTime: '16:00',
      capacity: 8,
      remark: '下午体验场',
    },
    {
      startTime: '16:30',
      endTime: '18:30',
      capacity: 8,
      remark: '傍晚好友场',
    },
    {
      startTime: '19:30',
      endTime: '21:30',
      capacity: 10,
      remark: '夜钓热门场',
    },
  ]
  const tasks = []

  for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
    const dateText = getDateText(addDays(today, dayIndex))

    for (const slot of slotTemplates) {
      const seedKey = `demo-slot-${dateText}-${slot.startTime}`
      tasks.push(upsertBySeedKey('time_slots', seedKey, {
        date: dateText,
        startTime: slot.startTime,
        endTime: slot.endTime,
        capacity: slot.capacity,
        bookedCount: 0,
        status: 'available',
        remark: slot.remark,
      }))
    }
  }

  return Promise.all(tasks)
}

async function upsertDemoPricingRules() {
  return upsertBySeedKey('pricing_rules', 'demo-pricing-hourly', {
    name: '现场计时标准价',
    description: '现场开单首小时固定价，超过一小时后按续钟价计费。',
    pricePerHour: 6800,
    firstHourAmount: 6800,
    extraPricePerHour: 5800,
    minimumMinutes: 60,
    unitMinutes: 30,
    status: 'active',
    sort: 1,
  })
}

async function upsertDemoGoods() {
  const goods = [
    {
      seedKey: 'demo-good-bait',
      data: {
        name: '加购虾饵',
        price: 1200,
        stock: 100,
        status: 'active',
        sort: 1,
      },
    },
    {
      seedKey: 'demo-good-drink',
      data: {
        name: '冰饮',
        price: 800,
        stock: 120,
        status: 'active',
        sort: 2,
      },
    },
  ]

  return Promise.all(goods.map(item => upsertBySeedKey('goods', item.seedKey, item.data)))
}

async function seedDemoData() {
  const [settings, packages, timeSlots, pricingRule, goods] = await Promise.all([
    upsertShopSettings(),
    upsertDemoPackages(),
    upsertDemoTimeSlots(),
    upsertDemoPricingRules(),
    upsertDemoGoods(),
  ])

  return [
    settings,
    ...packages,
    ...timeSlots,
    pricingRule,
    ...goods,
  ]
}

exports.main = async () => {
  const collections = collectionsConfig.collections || []
  const results = []

  for (const collection of collections) {
    results.push(await createCollectionIfNeeded(collection.name))
  }

  const seedResults = await seedDemoData()
  const failedCollections = results.filter(item => item.status === 'failed')
  const failedSeeds = seedResults.filter(item => item.status === 'failed')
  const hasFailures = failedCollections.length > 0 || failedSeeds.length > 0

  return {
    code: hasFailures ? 500 : 0,
    message: hasFailures ? '数据库初始化未完全成功，请查看 results 和 seedResults' : 'ok',
    data: {
      results,
      seedResults,
      debugVersion,
      summary: {
        collectionFailedCount: failedCollections.length,
        seedFailedCount: failedSeeds.length,
      },
    },
  }
}
