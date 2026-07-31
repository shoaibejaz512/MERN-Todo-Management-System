export const PERMISSIONS = {
  owner: [
    "read",
    "update",
    "complete",
    "archive",
    "restore",
    "delete",
    "share",
    "change-role",
    "remove-member",
  ],

  editor: ["read", "update", "complete"],

  collaborator: ["read", "complete"],

  viewer: ["read"],
};

export const can = (role, permission) => {
  return PERMISSIONS[role]?.includes(permission) ?? false;
};
