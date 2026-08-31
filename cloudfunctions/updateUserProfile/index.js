const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const users = db.collection('users')
const maxNicknameLength = 20

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

function normalizeUser(user) {
  return {
    _id: user._id,
    openid: user.openid || '',
    unionid: user.unionid || '',
    username: user.nickname || user.phone || user.openid || '',
    nickname: user.nickname || '',
    avatar: user.avatarUrl || '/static/images/default-avatar.png',
    avatarUrl: user.avatarUrl || '',
    phone: user.phone || '',
    countryCode: user.countryCode || '',
    role: user.role || 'customer',
    roles: [user.role || 'customer'],
    status: user.status || 'active',
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
    lastLoginAt: user.lastLoginAt || null,
    phoneUpdatedAt: user.phoneUpdatedAt || null,
    profileUpdatedAt: user.profileUpdatedAt || null,
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const nickname = normalizeString(event.nickname)

  if (!openid) {
    return fail(401, '请先登录后再修改昵称')
  }

  if (!nickname) {
    return fail(400, '请输入昵称')
  }

  if (nickname.length > maxNicknameLength) {
    return fail(400, `昵称不能超过 ${maxNicknameLength} 个字符`)
  }

  try {
    const userRes = await users.where({ openid }).limit(1).get()
    const user = userRes.data[0]

    if (!user || user.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    const now = new Date()
    const updateData = {
      nickname,
      updatedAt: now,
      profileUpdatedAt: now,
    }

    await users.doc(user._id).update({
      data: updateData,
    })

    return {
      code: 0,
      message: 'ok',
      data: {
        user: normalizeUser({
          ...user,
          ...updateData,
        }),
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '昵称修改失败')
  }
}
