import { assertLogin } from './authGuard'
import { initWechatCloud } from '@/cloud'

export interface UploadCloudFileResult {
  fileID: string
  cloudPath: string
}

function getFileExtension(filePath: string) {
  const matched = /\.([a-z0-9]+)(?:\?|#|$)/i.exec(filePath)

  return matched?.[1]?.toLowerCase() || 'jpg'
}

function createCloudPath(filePath: string) {
  const extension = getFileExtension(filePath)
  const randomText = Math.random().toString(36).slice(2, 8)

  return `shop-covers/${Date.now()}-${randomText}.${extension}`
}

export async function uploadShopCoverImage(tempFilePath: string): Promise<UploadCloudFileResult> {
  assertLogin('请先登录后上传封面图')

  const safeFilePath = tempFilePath.trim()

  if (!safeFilePath) {
    throw new Error('请选择要上传的封面图')
  }

  // #ifdef MP-WEIXIN
  if (!initWechatCloud()) {
    throw new Error('微信云开发未初始化')
  }

  const cloudPath = createCloudPath(safeFilePath)
  const res = await wx.cloud.uploadFile({
    cloudPath,
    filePath: safeFilePath,
  })

  return {
    fileID: res.fileID,
    cloudPath,
  }
  // #endif

  throw new Error('当前平台暂不支持上传封面图')
}
