export const ROLES = Object.freeze({
  admin: 'admin',
  issuer: 'issuer',
  investor: 'investor',
  manager: 'manager',
  member: 'member',
});

export const PERMISSIONS = Object.freeze({
  dashboardView: 'dashboard:view',
  usersView: 'users:view',
  usersManage: 'users:manage',
  settingsView: 'settings:view',
  settingsManage: 'settings:manage',
  organizationReviewView: 'organization-review:view',
  organizationReviewManage: 'organization-review:manage',
  auditLogsView: 'audit-logs:view',
  securityLogsView: 'security-logs:view',
});

export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.admin]: Object.values(PERMISSIONS),
  [ROLES.issuer]: [PERMISSIONS.dashboardView],
  [ROLES.investor]: [PERMISSIONS.dashboardView],
  [ROLES.manager]: [PERMISSIONS.dashboardView, PERMISSIONS.usersView, PERMISSIONS.settingsView],
  [ROLES.member]: [PERMISSIONS.dashboardView],
});
