const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const command = db.command

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
}

function getTodayText(date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

exports.main = async () => {
  try {
    const today = getTodayText(new Date())
    const [settingsRes, packagesRes, timeSlotsRes] = await Promise.all([
      db.collection('settings').limit(1).get(),
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
    ])

    return {
      code: 0,
      message: 'ok',
      data: {
        settings: settingsRes.data[0] || defaultSettings,
        packages: packagesRes.data,
        timeSlots: timeSlotsRes.data,
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
