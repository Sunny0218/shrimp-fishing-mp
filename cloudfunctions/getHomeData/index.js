const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const command = db.command
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

const defaultSettings = {
  shopName: '钓虾乐园',
  address: '请在门店设置中填写地址',
  phone: '',
  businessHours: [
    {
      label: '今日营业',
      startTime: '10:00',
      endTime: '22:00',
    },
  ],
  coverImages: [],
  notice: '欢迎预约到店钓虾，营业信息以门店现场为准。',
  bookingMode: 'walk_in',
  paymentMode: 'mock_auto_paid',
  pendingPaymentExpireMinutes: 1,
  notificationSettings: {
    customerEnabled: true,
    staffEnabled: true,
    reminderBeforeMinutes: 10,
    templates: notificationTemplateConfig,
  },
}

function getTodayText(date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

async function getShopSettings() {
  const seededRes = await db.collection('settings').where({ seedKey: shopSettingsSeedKey }).limit(1).get()

  if (seededRes.data[0]) {
    return seededRes.data[0]
  }

  const settingsRes = await db.collection('settings').limit(1).get()

  return settingsRes.data[0] || defaultSettings
}

exports.main = async () => {
  try {
    const today = getTodayText(new Date())
    const [settings, packagesRes, timeSlotsRes, pricingRuleRes] = await Promise.all([
      getShopSettings(),
      db.collection('packages').where({ status: 'active' }).orderBy('sort', 'asc').limit(10).get(),
      db
        .collection('time_slots')
        .where({
          date: command.gte(today),
          status: command.in(['available', 'full']),
        })
        .orderBy('date', 'asc')
        .orderBy('startTime', 'asc')
        .limit(8)
        .get(),
      db.collection('pricing_rules').where({ status: 'active' }).orderBy('sort', 'asc').limit(1).get().catch(() => ({ data: [] })),
    ])

    return {
      code: 0,
      message: 'ok',
      data: {
        settings,
        packages: packagesRes.data,
        timeSlots: timeSlotsRes.data,
        pricingRule: pricingRuleRes.data[0],
        serverTime: new Date().toISOString(),
      },
    }
  }
  catch (error) {
    return {
      code: 500,
      message: error.message || '首页数据获取失败',
      data: null,
    }
  }
}
