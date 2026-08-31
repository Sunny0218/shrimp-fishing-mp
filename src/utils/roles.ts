import type { UserRole } from '@/api/types/login'

export const manageRoles: UserRole[] = ['staff', 'admin', 'super_admin']
export const shopEditRoles: UserRole[] = ['super_admin']
export const statusToggleRoles: UserRole[] = ['admin', 'super_admin']
export const roleManageRoles: UserRole[] = ['super_admin']

export const roleTextMap: Record<UserRole, string> = {
  customer: '顾客',
  staff: '普通员工',
  admin: '店长/主管',
  super_admin: '店主',
}

export const roleOptions: Array<{ label: string, value: UserRole }> = [
  { label: roleTextMap.customer, value: 'customer' },
  { label: roleTextMap.staff, value: 'staff' },
  { label: roleTextMap.admin, value: 'admin' },
  { label: roleTextMap.super_admin, value: 'super_admin' },
]

export function getRoleText(role?: UserRole) {
  return roleTextMap[role || 'customer']
}

export function hasRole(role: UserRole | undefined, roles: UserRole[]) {
  return !!role && roles.includes(role)
}
