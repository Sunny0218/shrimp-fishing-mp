import type { CloudFunctionResponse } from './types/home'
import { useTokenStore, useUserStore } from '@/store'

export class LoginRequiredError extends Error {
  code = 401

  constructor(message = '请先登录') {
    super(message)
    this.name = 'LoginRequiredError'
  }
}

export function assertLogin(message = '请先登录后继续操作') {
  const tokenStore = useTokenStore()

  if (!tokenStore.updateNowTime().hasLogin) {
    throw new LoginRequiredError(message)
  }
}

export function resolveCloudResponse<T>(res: CloudFunctionResponse<T>, fallbackMessage: string) {
  if (res.code === 401) {
    clearLocalLoginState()
    throw new LoginRequiredError(res.message || '登录已过期，请重新登录')
  }

  if (res.code !== 0) {
    throw new Error(res.message || fallbackMessage)
  }

  return res.data
}

function clearLocalLoginState() {
  const tokenStore = useTokenStore()
  const userStore = useUserStore()

  void tokenStore.logout()
  userStore.clearUserInfo()
}
