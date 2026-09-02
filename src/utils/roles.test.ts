import { describe, expect, it } from 'vitest'
import { assignableRoleOptions, getRoleText, hasRole, manageRoles, roleManageRoles, shopEditRoles, statusToggleRoles } from './roles'

describe('roles', () => {
  it('管理角色包含普通员工、管理员和店主', () => {
    expect(hasRole('staff', manageRoles)).toBe(true)
    expect(hasRole('admin', manageRoles)).toBe(true)
    expect(hasRole('super_admin', manageRoles)).toBe(true)
    expect(hasRole('customer', manageRoles)).toBe(false)
  })

  it('状态调整权限只开放给管理员和店主', () => {
    expect(hasRole('staff', statusToggleRoles)).toBe(false)
    expect(hasRole('admin', statusToggleRoles)).toBe(true)
    expect(hasRole('super_admin', statusToggleRoles)).toBe(true)
  })

  it('门店信息和角色管理权限保持收敛', () => {
    expect(hasRole('admin', shopEditRoles)).toBe(false)
    expect(hasRole('super_admin', shopEditRoles)).toBe(true)
    expect(hasRole('admin', roleManageRoles)).toBe(false)
    expect(hasRole('super_admin', roleManageRoles)).toBe(true)
  })

  it('角色文案有默认兜底', () => {
    expect(getRoleText('staff')).toBe('普通员工')
    expect(getRoleText()).toBe('顾客')
  })

  it('可分配角色不包含店主', () => {
    expect(assignableRoleOptions.map(item => item.value)).toEqual(['customer', 'staff', 'admin'])
  })
})
