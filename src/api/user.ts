import type { CloudFunctionResponse } from './types/home'
import type { GetManageUsersParams, ManageUsersData, UpdateUserProfileParams, UpdateUserProfileResult, UpdateUserRoleParams, UpdateUserRoleResult } from './types/user'
import { assertLogin, resolveCloudResponse } from './authGuard'
import { callCloudFunction } from '@/cloud'

export async function getManageUsers(params: GetManageUsersParams = {}) {
  assertLogin('请先登录后管理角色')

  const page = Math.max(Number(params.page) || 1, 1)
  const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 50)
  const keyword = params.keyword?.trim() || ''

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<ManageUsersData>, Record<string, unknown>>(
    'getManageUsers',
    {
      page,
      pageSize,
      keyword,
    },
  )

  return resolveCloudResponse(res, '用户列表获取失败')
  // #endif

  return {
    rows: [],
    total: 0,
    page,
    pageSize,
    hasMore: false,
    serverTime: new Date().toISOString(),
  }
}

export async function updateUserRole(params: UpdateUserRoleParams) {
  assertLogin('请先登录后调整角色')

  const userId = params.userId.trim()

  if (!userId) {
    throw new Error('缺少用户 ID')
  }

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<UpdateUserRoleResult>, Record<string, unknown>>(
    'updateUserRole',
    {
      userId,
      role: params.role,
    },
  )

  return resolveCloudResponse(res, '角色调整失败')
  // #endif

  throw new Error('当前平台暂不支持调整角色')
}

export async function updateUserProfile(params: UpdateUserProfileParams) {
  assertLogin('请先登录后修改昵称')

  const nickname = params.nickname.trim()

  if (!nickname) {
    throw new Error('请输入昵称')
  }

  // #ifdef MP-WEIXIN
  const res = await callCloudFunction<CloudFunctionResponse<UpdateUserProfileResult>, Record<string, unknown>>(
    'updateUserProfile',
    {
      nickname,
    },
  )

  return resolveCloudResponse(res, '昵称修改失败')
  // #endif

  throw new Error('当前平台暂不支持修改昵称')
}
