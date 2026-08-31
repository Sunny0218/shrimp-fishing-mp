const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const { CUSTOMER_ROLE, SUPER_ADMIN_ROLE, roleWeightMap, validRoles } = require('../common/roles')
const maxPageSize = 50
const maxFetchCount = 1000

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

function normalizePositiveInteger(value, fallback) {
  const numberValue = Number(value)

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return fallback
  }

  return Math.floor(numberValue)
}

function normalizeUser(user) {
  return {
    _id: user._id,
    openid: user.openid || '',
    nickname: user.nickname || '',
    avatarUrl: user.avatarUrl || '',
    phone: user.phone || '',
    countryCode: user.countryCode || '',
    role: user.role || CUSTOMER_ROLE,
    status: user.status || 'active',
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
    lastLoginAt: user.lastLoginAt || null,
  }
}

function getTimeValue(value) {
  if (!value) {
    return 0
  }

  const date = value instanceof Date ? value : new Date(value)
  const time = date.getTime()

  return Number.isFinite(time) ? time : 0
}

function getRoleWeight(role) {
  return roleWeightMap[role || CUSTOMER_ROLE] || 0
}

function compareUsers(a, b) {
  const roleDiff = getRoleWeight(b.role) - getRoleWeight(a.role)

  if (roleDiff !== 0) {
    return roleDiff
  }

  const loginDiff = getTimeValue(b.lastLoginAt) - getTimeValue(a.lastLoginAt)

  if (loginDiff !== 0) {
    return loginDiff
  }

  return getTimeValue(b.createdAt) - getTimeValue(a.createdAt)
}

function matchKeyword(user, keyword) {
  if (!keyword) {
    return true
  }

  const lowerKeyword = keyword.toLowerCase()
  const searchableText = [
    user.nickname,
    user.phone,
    user.openid,
  ].filter(Boolean).join(' ').toLowerCase()

  return searchableText.includes(lowerKeyword)
}

function matchRole(user, roleFilter) {
  if (!roleFilter || roleFilter === 'all') {
    return true
  }

  return (user.role || 'customer') === roleFilter
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const page = normalizePositiveInteger(event.page, 1)
  const rawPageSize = normalizePositiveInteger(event.pageSize, 20)
  const pageSize = Math.min(rawPageSize, maxPageSize)
  const keyword = normalizeString(event.keyword)
  const roleFilter = normalizeString(event.roleFilter)

  if (!openid) {
    return fail(401, '请先登录后再管理角色')
  }

  if (roleFilter && roleFilter !== 'all' && !validRoles.includes(roleFilter)) {
    return fail(400, '筛选角色不正确')
  }

  try {
    const operatorRes = await db.collection('users').where({ openid }).limit(1).get()
    const operator = operatorRes.data[0]

    if (!operator || operator.status === 'disabled') {
      return fail(403, '账号不可用，请联系门店')
    }

    if (operator.role !== SUPER_ADMIN_ROLE) {
      return fail(403, '仅超级管理员可管理角色')
    }

    const usersRes = await db.collection('users')
      .orderBy('lastLoginAt', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(maxFetchCount)
      .get()
    const matchedRows = usersRes.data
      .map(normalizeUser)
      .filter(user => matchKeyword(user, keyword))
      .filter(user => matchRole(user, roleFilter))
      .sort(compareUsers)
    const start = (page - 1) * pageSize
    const rows = matchedRows.slice(start, start + pageSize)

    return {
      code: 0,
      message: 'ok',
      data: {
        rows,
        total: matchedRows.length,
        page,
        pageSize,
        hasMore: start + rows.length < matchedRows.length,
        serverTime: new Date().toISOString(),
      },
    }
  }
  catch (error) {
    return fail(500, error.message || '用户列表获取失败')
  }
}
