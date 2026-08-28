import type { CloudFunctionResponse } from './types/home'
import type { DeletePackageParams, DeletePackageResult, ManagePackagesData, SavePackageParams, SavePackageResult, UpdatePackageStatusParams, UpdatePackageStatusResult } from './types/package'
import { assertLogin, resolveCloudResponse } from './authGuard'
import { callCloudFunction } from '@/cloud'

export async function getManagePackages() {
  assertLogin('请先登录后管理套餐')

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<ManagePackagesData>>('getManagePackages')

  return resolveCloudResponse(res, '套餐获取失败')
  // #endif

  return {
    rows: [],
    total: 0,
    canEdit: false,
    serverTime: new Date().toISOString(),
  }
}

export async function savePackage(params: SavePackageParams) {
  assertLogin('请先登录后保存套餐')

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

  return resolveCloudResponse(res, '套餐保存失败')
  // #endif

  throw new Error('当前平台暂不支持保存套餐')
}

export async function updatePackageStatus(params: UpdatePackageStatusParams) {
  assertLogin('请先登录后调整套餐')

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

  return resolveCloudResponse(res, '套餐状态调整失败')
  // #endif

  throw new Error('当前平台暂不支持调整套餐')
}

export async function deletePackage(params: DeletePackageParams) {
  assertLogin('请先登录后删除套餐')

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

  return resolveCloudResponse(res, '套餐删除失败')
  // #endif

  throw new Error('当前平台暂不支持删除套餐')
}
