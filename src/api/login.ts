import type { IAuthLoginRes, ICaptcha, ICloudFunctionResponse, IDoubleTokenRes, IUpdateInfo, IUpdatePassword, IUserInfoRes } from './types/login'
import { http } from '@/http/http'
import { callCloudFunction } from '@/cloud'

/**
 * 登录表单
 */
export interface ILoginForm {
  username: string
  password: string
}

/**
 * 获取验证码
 * @returns ICaptcha 验证码
 */
export function getCode() {
  return http.get<ICaptcha>('/user/getCode')
}

/**
 * 用户登录
 * @param loginForm 登录表单
 */
export function login(loginForm: ILoginForm) {
  return http.post<IAuthLoginRes>('/auth/login', loginForm)
}

/**
 * 刷新token
 * @param refreshToken 刷新token
 */
export function refreshToken(refreshToken: string) {
  return http.post<IDoubleTokenRes>('/auth/refreshToken', { refreshToken })
}

/**
 * 获取用户信息
 */
export function getUserInfo() {
  // #ifdef MP-WEIXIN
  return getCloudUserInfo()
  // #endif

  return http.get<IUserInfoRes>('/user/info')
}

/**
 * 退出登录
 */
export function logout() {
  return http.get<void>('/auth/logout')
}

/**
 * 修改用户信息
 */
export function updateInfo(data: IUpdateInfo) {
  return http.post('/user/updateInfo', data)
}

/**
 * 修改用户密码
 */
export function updateUserPassword(data: IUpdatePassword) {
  return http.post('/user/updatePassword', data)
}

/**
 * 获取微信登录凭证
 * @returns Promise 包含微信登录凭证(code)
 */
export function getWxCode() {
  return new Promise<UniApp.LoginRes>((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: res => resolve(res),
      fail: err => reject(new Error(err)),
    })
  })
}

/**
 * 微信登录
 * @param params 微信登录参数，包含code
 * @returns Promise 包含登录结果
 */
export async function wxLogin(_data?: { code: string }) {
  // #ifdef MP-WEIXIN
  const userInfo = await getCloudUserInfo()

  return {
    token: `wechat-cloud:${userInfo.openid || userInfo.userId}`,
    expiresIn: 30 * 24 * 60 * 60,
    userInfo,
  }
  // #endif

  const data = _data
  if (!data) {
    throw new Error('缺少微信登录 code')
  }
  return http.post<IAuthLoginRes>('/auth/wxLogin', data)
}

export async function bindWechatPhoneNumber(data: { code: string }) {
  const code = data.code.trim()

  if (!code) {
    throw new Error('缺少手机号授权 code')
  }

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<ICloudFunctionResponse<WechatCloudUser>, Record<string, unknown>>(
    'bindPhoneNumber',
    {
      code,
    },
  )

  if (res.code !== 0 || !res.data) {
    throw new Error(res.message || '手机号授权失败')
  }

  return normalizeCloudUser(res.data)
  // #endif

  throw new Error('当前平台暂不支持手机号授权')
}

async function getCloudUserInfo() {
  const res = await callCloudFunction<ICloudFunctionResponse<WechatCloudUser>>('login')

  if (res.code !== 0 || !res.data) {
    throw new Error(res.message || '微信云登录失败')
  }

  return normalizeCloudUser(res.data)
}

interface WechatCloudUser {
  _id: string
  openid: string
  unionid?: string
  nickname?: string
  avatarUrl?: string
  phone?: string
  countryCode?: string
  role?: IUserInfoRes['role']
  status?: IUserInfoRes['status']
  createdAt?: string | Date
  updatedAt?: string | Date
  lastLoginAt?: string | Date
  phoneUpdatedAt?: string | Date
}

function normalizeCloudUser(user: WechatCloudUser): IUserInfoRes {
  return {
    userId: user._id,
    _id: user._id,
    openid: user.openid,
    unionid: user.unionid || '',
    username: user.nickname || user.phone || user.openid || '',
    nickname: user.nickname || '微信用户',
    avatar: user.avatarUrl || '/static/images/default-avatar.png',
    avatarUrl: user.avatarUrl || '',
    phone: user.phone || '',
    countryCode: user.countryCode || '',
    role: user.role || 'customer',
    roles: [user.role || 'customer'],
    status: user.status || 'active',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
    phoneUpdatedAt: user.phoneUpdatedAt,
  }
}
