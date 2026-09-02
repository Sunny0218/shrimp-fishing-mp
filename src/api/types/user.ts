import type { IUserInfoRes, UserRole } from './login'

export type AssignableUserRole = Exclude<UserRole, 'super_admin'>

export interface ManageUsersData {
  rows: IUserInfoRes[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
  serverTime: string
}

export interface GetManageUsersParams {
  page?: number
  pageSize?: number
  keyword?: string
  roleFilter?: UserRole | 'all'
}

export interface UpdateUserRoleParams {
  userId: string
  role: AssignableUserRole
}

export interface UpdateUserRoleResult {
  user: IUserInfoRes
}

export interface UpdateUserProfileParams {
  nickname: string
}

export interface UpdateUserProfileResult {
  user: IUserInfoRes
}
