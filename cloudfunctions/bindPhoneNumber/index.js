const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const users = db.collection('users')

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
  const code = typeof event.code === 'string' ? event.code.trim() : ''

  if (!openid) {
    return fail(401, '请先登录后再授权手机号')
  }

  if (!code) {
    return fail(400, '缺少手机号授权 code')
  }

  try {
    const phoneRes = await cloud.openapi.phonenumber.getPhoneNumber({
      code,
    })
    const phoneInfo = phoneRes.phoneInfo

    if (!phoneInfo?.phoneNumber) {
      return fail(500, '手机号授权失败')
    }

    const userRes = await users.where({ openid }).limit(1).get()
    const user = userRes.data[0]

    if (!user || user.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    const now = new Date()
    const updateData = {
      phone: phoneInfo.purePhoneNumber || phoneInfo.phoneNumber,
      countryCode: phoneInfo.countryCode || '',
      phoneUpdatedAt: now,
      updatedAt: now,
    }

    await users.doc(user._id).update({
      data: updateData,
    })

    return {
      code: 0,
      message: 'ok',
      data: {
        ...user,
        ...updateData,
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '手机号授权失败')
  }
}
