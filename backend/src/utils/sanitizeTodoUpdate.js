// utils/sanitizeTodoUpdate.js
const COLLABORATOR_EDITABLE = ["status"]; // collaborators can only flip status
const OWNER_EDITABLE = ["title", "status"];

export function sanitizeTodoUpdate(body, role) {
  const allowedFields =
    role === "owner" ? OWNER_EDITABLE : COLLABORATOR_EDITABLE;
  const clean = {};
  for (const field of allowedFields) {
    if (field in body) clean[field] = body[field];
  }
  return clean;
}
