const wxCloudEnvId = import.meta.env.VITE_WX_CLOUD_ENV_ID

let isWechatCloudReady = false
const defaultCloudFunctionTimeout = 15000

export function initWechatCloud() {
  // #ifdef MP-WEIXIN
  if (isWechatCloudReady) {
    return true
  }

  if (!wxCloudEnvId) {
    console.warn('未配置 VITE_WX_CLOUD_ENV_ID，微信云开发暂未初始化')
    return false
  }

  if (!wx?.cloud) {
    console.warn('当前微信基础库不支持 wx.cloud')
    return false
  }

  wx.cloud.init({
    env: wxCloudEnvId,
    traceUser: true,
  })
  isWechatCloudReady = true
  return true
  // #endif

  return false
}

export async function callCloudFunction<T = unknown, D extends Record<string, unknown> = Record<string, unknown>>(
  name: string,
  data?: D,
  options?: {
    timeout?: number
  },
) {
  // #ifdef MP-WEIXIN
  if (!isWechatCloudReady) {
    initWechatCloud()
  }

  if (!isWechatCloudReady) {
    throw new Error('微信云开发未初始化')
  }

  const timeout = options?.timeout ?? defaultCloudFunctionTimeout
  const request = wx.cloud.callFunction({
    name,
    data,
  })
  const timer = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`云函数 ${name} 调用超时，请检查是否误开本地调试或云函数是否已部署`))
    }, timeout)
  })

  const res = await Promise.race([request, timer])

  return res.result as T
  // #endif

  throw new Error('当前平台不支持微信云开发')
}

export function getWechatCloudEnvId() {
  return wxCloudEnvId
}
