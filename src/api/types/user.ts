import type { IUserInfoRes, UserRole } from './login'

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
}

export interface UpdateUserRoleParams {
  userId: string
  role: UserRole
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
