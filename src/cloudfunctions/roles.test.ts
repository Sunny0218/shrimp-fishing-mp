import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface RolesModule {
  CUSTOMER_ROLE: string
  STAFF_ROLE: string
  ADMIN_ROLE: string
  SUPER_ADMIN_ROLE: string
  assignableRoles: string[]
  validRoles: string[]
}

const require = createRequire(import.meta.url)
const roles = require('../../cloudfunctions/common/roles.js') as RolesModule

describe('cloudfunctions/common/roles', () => {
  it('角色全集包含店主，但可分配角色不包含店主', () => {
    expect(roles.validRoles).toContain(roles.SUPER_ADMIN_ROLE)
    expect(roles.assignableRoles).toEqual([
      roles.CUSTOMER_ROLE,
      roles.STAFF_ROLE,
      roles.ADMIN_ROLE,
    ])
    expect(roles.assignableRoles).not.toContain(roles.SUPER_ADMIN_ROLE)
  })
})
