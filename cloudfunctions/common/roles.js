const CUSTOMER_ROLE = 'customer'
const STAFF_ROLE = 'staff'
const ADMIN_ROLE = 'admin'
const SUPER_ADMIN_ROLE = 'super_admin'

const manageRoles = [STAFF_ROLE, ADMIN_ROLE, SUPER_ADMIN_ROLE]
const statusToggleRoles = [ADMIN_ROLE, SUPER_ADMIN_ROLE]
const shopEditRoles = [SUPER_ADMIN_ROLE]
const roleManageRoles = [SUPER_ADMIN_ROLE]
const validRoles = [CUSTOMER_ROLE, STAFF_ROLE, ADMIN_ROLE, SUPER_ADMIN_ROLE]
const assignableRoles = [CUSTOMER_ROLE, STAFF_ROLE, ADMIN_ROLE]
const roleWeightMap = {
  [SUPER_ADMIN_ROLE]: 3,
  [ADMIN_ROLE]: 2,
  [STAFF_ROLE]: 1,
  [CUSTOMER_ROLE]: 0,
}

function hasRole(role, roles) {
  return !!role && roles.includes(role)
}

module.exports = {
  CUSTOMER_ROLE,
  STAFF_ROLE,
  ADMIN_ROLE,
  SUPER_ADMIN_ROLE,
  manageRoles,
  statusToggleRoles,
  shopEditRoles,
  roleManageRoles,
  validRoles,
  assignableRoles,
  roleWeightMap,
  hasRole,
}
