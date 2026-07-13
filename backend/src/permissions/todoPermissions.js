// permissions/todoPermissions.js
const PERMISSIONS = {
  owner: ["read", "update", "complete", "delete", "share", "unshare"],
  collaborator: ["read","complete","reject"],
};

export function can(role, action) {
  return PERMISSIONS[role]?.includes(action) ?? false;
}

