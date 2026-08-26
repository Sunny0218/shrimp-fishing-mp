import type { CloudFunctionResponse } from './types/home'
import type { DeletePackageParams, DeletePackageResult, ManagePackagesData, SavePackageParams, SavePackageResult, UpdatePackageStatusParams, UpdatePackageStatusResult } from './types/package'
import { callCloudFunction } from '@/cloud'

export async function getManagePackages() {
  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<ManagePackagesData>>('getManagePackages')

  if (res.code !== 0) {
    throw new Error(res.message || '套餐获取失败')
  }

  return res.data
  // #endif

  return {
    rows: [],
    total: 0,
    canEdit: false,
    serverTime: new Date().toISOString(),
  }
}

export async function savePackage(params: SavePackageParams) {
  const requestParams: SavePackageParams = {
    ...(params.packageId ? { packageId: params.packageId.trim() } : {}),
    name: params.name.trim(),
    description: params.description.trim(),
    durationMinutes: params.durationMinutes,
    price: params.price,
    rodCount: params.rodCount,
    maxPeople: params.maxPeople,
    status: params.status,
    sort: params.sort,
  }

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<SavePackageResult>, Record<string, unknown>>(
    'savePackage',
    { ...requestParams },
  )

  if (res.code !== 0) {
    throw new Error(res.message || '套餐保存失败')
  }

  return res.data
  // #endif

  throw new Error('当前平台暂不支持保存套餐')
}

export async function updatePackageStatus(params: UpdatePackageStatusParams) {
  const packageId = params.packageId.trim()

  if (!packageId) {
    throw new Error('缺少套餐 ID')
  }

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<UpdatePackageStatusResult>, Record<string, unknown>>(
    'updatePackageStatus',
    {
      packageId,
      status: params.status,
    },
  )

  if (res.code !== 0) {
    throw new Error(res.message || '套餐状态调整失败')
  }

  return res.data
  // #endif

  throw new Error('当前平台暂不支持调整套餐')
}

export async function deletePackage(params: DeletePackageParams) {
  const packageId = params.packageId.trim()

  if (!packageId) {
    throw new Error('缺少套餐 ID')
  }

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<DeletePackageResult>, Record<string, unknown>>(
    'deletePackage',
    {
      packageId,
    },
  )

  if (res.code !== 0) {
    throw new Error(res.message || '套餐删除失败')
  }

  return res.data
  // #endif

  throw new Error('当前平台暂不支持删除套餐')
}
