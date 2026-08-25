const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const users = db.collection('users')

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const now = new Date()
  const { OPENID: openid, UNIONID: unionid } = wxContext

  if (!openid) {
    return {
      code: 401,
      message: '未获取到微信 openid',
      data: null,
    }
  }

  const existing = await users.where({ openid }).limit(1).get()

  if (existing.data.length > 0) {
    const user = existing.data[0]
    await users.doc(user._id).update({
      data: {
        lastLoginAt: now,
        updatedAt: now,
      },
    })

    return {
      code: 0,
      message: 'ok',
      data: {
        ...user,
        lastLoginAt: now,
        updatedAt: now,
      },
    }
  }

  const userData = {
    openid,
    unionid: unionid || '',
    nickname: '',
    avatarUrl: '',
    phone: '',
    role: 'customer',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  }

  const created = await users.add({
    data: userData,
  })

  return {
    code: 0,
    message: 'ok',
    data: {
      _id: created._id,
      ...userData,
    },
  }
}
