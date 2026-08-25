const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const manageRoles = ['staff', 'admin', 'super_admin']

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
  const orderId = typeof event.orderId === 'string' ? event.orderId.trim() : ''

  if (!openid) {
    return fail(401, '请先登录后再查看订单')
  }

  if (!orderId) {
    return fail(400, '缺少订单 ID')
  }

  try {
    const [userRes, orderRes] = await Promise.all([
      db.collection('users').where({ openid }).limit(1).get(),
      db.collection('orders').doc(orderId).get(),
    ])
    const user = userRes.data[0]
    const order = orderRes.data

    if (!user || user.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    if (!order) {
      return fail(404, '订单不存在')
    }

    const canManage = manageRoles.includes(user.role)
    const isOwner = order.openid === openid

    if (!canManage && !isOwner) {
      return fail(403, '无权限查看该订单')
    }

    const [packageRes, timeSlotRes] = await Promise.all([
      order.packageId ? db.collection('packages').doc(order.packageId).get().catch(() => ({ data: null })) : Promise.resolve({ data: null }),
      order.slotId ? db.collection('time_slots').doc(order.slotId).get().catch(() => ({ data: null })) : Promise.resolve({ data: null }),
    ])

    return {
      code: 0,
      message: 'ok',
      data: {
        order,
        package: packageRes.data,
        timeSlot: timeSlotRes.data,
        serverTime: new Date().toISOString(),
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '订单详情获取失败')
  }
}
