import { ROLE_PERMISSIONS, ROLES } from '@/config/permissions';
import { decodeJwtPayload } from '@/services/token.service';

const ROLE_UIDS = Object.freeze({
  '00000000-0000-4000-8000-000000000001': ROLES.admin,
  '00000000-0000-4000-8000-000000000003': ROLES.issuer,
  '00000000-0000-4000-8000-000000000004': ROLES.investor,
});

const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null);

const normalizeRole = (source, claims) => {
  const roleUid = firstDefined(
    source?.roleUid,
    source?.role?.roleUid,
    claims?.roleUid,
    claims?.role?.roleUid,
  );
  const rawRole = firstDefined(
    source?.roleName,
    source?.roles?.[0]?.roleName,
    source?.roles?.[0]?.name,
    typeof source?.roles?.[0] === 'string' ? source.roles[0] : undefined,
    source?.role?.roleName,
    source?.role?.name,
    typeof source?.role === 'string' ? source.role : undefined,
    claims?.roleName,
    claims?.roles?.[0]?.roleName,
    claims?.roles?.[0]?.name,
    typeof claims?.roles?.[0] === 'string' ? claims.roles[0] : undefined,
    claims?.role,
    ROLE_UIDS[roleUid],
  );
  const normalized = String(rawRole || '').trim().toLowerCase();

  if (normalized.includes('admin')) return ROLES.admin;
  if (normalized.includes('issuer')) return ROLES.issuer;
  if (normalized.includes('investor')) return ROLES.investor;
  if (normalized.includes('manager')) return ROLES.manager;
  if (normalized.includes('member')) return ROLES.member;
  return ROLE_UIDS[roleUid] || ROLES.member;
};

const normalizePermissions = (source, role) => {
  const rawPermissions = firstDefined(source?.permissions, source?.role?.permissions, []);
  const permissions = Array.isArray(rawPermissions)
    ? rawPermissions
        .map((permission) =>
          typeof permission === 'string'
            ? permission
            : firstDefined(permission?.permissionCode, permission?.code, permission?.name),
        )
        .filter(Boolean)
    : [];

  return [...new Set([...(ROLE_PERMISSIONS[role] || []), ...permissions])];
};

export const normalizeAuthSession = (payload) => {
  const accessToken = firstDefined(payload?.accessToken, payload?.token, payload?.jwt);
  if (!accessToken) throw new Error('Login response did not include an access token.');

  const claims = decodeJwtPayload(accessToken) || {};
  const profile = payload?.user || payload?.account || payload?.profile || {};
  const source = { ...(payload || {}), ...profile };
  const role = normalizeRole(source, claims);
  const email = firstDefined(source?.email, claims?.email, claims?.preferred_username, '');
  const name = firstDefined(
    source?.fullName,
    source?.name,
    source?.displayName,
    claims?.fullName,
    claims?.name,
    email ? email.split('@')[0] : 'T-REX User',
  );

  return {
    accessToken,
    user: {
      id: firstDefined(
        source?.userUid,
        source?.uid,
        source?.id,
        claims?.userUid,
        claims?.uid,
        claims?.sub,
      ),
      userUid: firstDefined(source?.userUid, claims?.userUid, source?.uid, claims?.uid, claims?.sub),
      name,
      fullName: name,
      email,
      role,
      roleUid: firstDefined(source?.roleUid, source?.role?.roleUid, claims?.roleUid),
      permissions: normalizePermissions(source, role),
      company: firstDefined(source?.company, source?.organizationName, source?.organization?.name, ''),
      emailVerified: firstDefined(source?.emailVerified, claims?.emailVerified, claims?.email_verified),
      isActive: firstDefined(source?.isActive, claims?.isActive, true),
    },
  };
};
