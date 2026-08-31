const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const superAdminRole = 'super_admin'
const validRoles = ['customer', 'staff', 'admin', 'super_admin']

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

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const userId = normalizeString(event.userId)
  const role = normalizeString(event.role)

  if (!openid) {
    return fail(401, '请先登录后再调整角色')
  }

  if (!userId) {
    return fail(400, '缺少用户 ID')
  }

  if (!validRoles.includes(role)) {
    return fail(400, '角色不正确')
  }

  try {
    const operatorRes = await db.collection('users').where({ openid }).limit(1).get()
    const operator = operatorRes.data[0]

    if (!operator || operator.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    if (operator.role !== superAdminRole) {
      return fail(403, '仅超级管理员可调整角色')
    }

    const targetRes = await db.collection('users').doc(userId).get()
    const targetUser = targetRes.data

    if (!targetUser) {
      return fail(404, '用户不存在')
    }

    if (targetUser.openid === openid && role !== superAdminRole) {
      return fail(400, '不能移除自己的超级管理员权限')
    }

    const now = new Date()

    await db.collection('users').doc(userId).update({
      data: {
        role,
        updatedAt: now,
        roleUpdatedAt: now,
        roleUpdatedBy: openid,
      },
    })

    const result = {
      ...targetUser,
      role,
      updatedAt: now,
      roleUpdatedAt: now,
      roleUpdatedBy: openid,
    }

    return {
      code: 0,
      message: 'ok',
      data: {
        user: result,
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '角色调整失败')
  }
}
