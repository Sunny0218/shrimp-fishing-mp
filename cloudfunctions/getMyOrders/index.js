const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()

function fail(code, message) {
  return {
    code,
    message,
    data: null,
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return fail(401, '请先登录后再查看订单')
  }

  const status = typeof event.status === 'string' ? event.status.trim() : 'all'

  try {
    const where = status && status !== 'all'
      ? { openid, status }
      : { openid }

    const [countRes, listRes] = await Promise.all([
      db.collection('orders').where(where).count(),
      db
        .collection('orders')
        .where(where)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get(),
    ])

    return {
      code: 0,
      message: 'ok',
      data: {
        rows: listRes.data,
        total: countRes.total,
        serverTime: new Date().toISOString(),
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '我的订单获取失败')
  }
}
