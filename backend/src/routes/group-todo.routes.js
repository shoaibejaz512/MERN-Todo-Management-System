import { Router } from "express";
import { verifyJWT } from "../middlewears/auth/use.auth.middleware.js";
import {
  generateAIGroupTodo,
  getGroupTodoById,
  getAllGroupTodos,
  createGroupTodo,
  deleteGroupTodo,
  archiveGroupTodo,
  restoreDeletedGroupTodo,
  saveAIGroupTodo,
  updateGroupTodo,
  updateGroupTodoStatus,
  restoreArchiveGroupTodo,
  shareGroupTodo,
  getGroupMembers,
  updateMemberRole,
  removeMember,
  leaveGroupTodo,
  getPendingGroupInvitation,
  acceptGroupInvitation,
  rejectGroupInvitation,
  cloneGroupTask,
  commentGroupTask,
  getCommentsGroupTasks,
  updateCommentsGroupTasks,
  getPendingTaskInvitations,
} from "../controllers/groupTodo.controller.js";
import { authorizeGroupPermission } from "../middlewears/authorizeGroupPermission.js";

const router = Router();

////////////////////////////////////////////////////////////////////////////////
// GROUP TODO CRUD
////////////////////////////////////////////////////////////////////////////////

router.route("/").post(verifyJWT, createGroupTodo);
router.route("/ai/generate").post(verifyJWT, generateAIGroupTodo);
router.route("/ai/save").post(verifyJWT, saveAIGroupTodo);
router.route("/").get(verifyJWT, getAllGroupTodos);
router.route("/:id").get(verifyJWT, getGroupTodoById);
router.route("/:id").delete(verifyJWT, deleteGroupTodo);
router.route("/:id").put(verifyJWT, updateGroupTodo);
router.route("/:id/status").patch(verifyJWT, updateGroupTodoStatus);
router.route("/:id/archive").patch(verifyJWT, archiveGroupTodo);
router.route("/:id/restore/archive").patch(verifyJWT, restoreArchiveGroupTodo);
router.route("/:id/restore").patch(verifyJWT, restoreDeletedGroupTodo);

////////////////////////////////////////////////////////////////////////////////
// COLLABORATION
////////////////////////////////////////////////////////////////////////////////

// Share Todo
// Body:
// {
//    "email":"friend@gmail.com",
//    "role":"editor"
// }
router
  .route("/:id/share")
  .post(verifyJWT, authorizeGroupPermission("share"), shareGroupTodo);

//get pending invitation
router.route("/invitations").get(verifyJWT, getPendingGroupInvitation);

//get single task pending invitations
router
  .route("/:id/pending-invitations")
  .get(verifyJWT, getPendingTaskInvitations);

//accept invitation
router
  .route("/invitations/:inviteId/accept")
  .post(verifyJWT, acceptGroupInvitation);

//reject invitation
router
  .route("/invitations/:inviteId/reject")
  .post(verifyJWT, rejectGroupInvitation);

//clone the group task
router.route("/:id/duplicate").post(verifyJWT, cloneGroupTask);

//router only collaborators can comment on task
router.route("/:id/comment").post(verifyJWT, commentGroupTask);

//get comments
router.route("/:id/comments").get(verifyJWT, getCommentsGroupTasks);

//update comment
router.route("/comments/:id").patch(verifyJWT, updateCommentsGroupTasks);

// Get Members
router
  .route("/:id/members")
  .get(verifyJWT, authorizeGroupPermission("read"), getGroupMembers);

// Change Member Role
// Body:
// {
//    "role":"viewer"
// }
router
  .route("/:id/members/:memberId/role")
  .patch(verifyJWT, authorizeGroupPermission("change-role"), updateMemberRole);

// Remove Member
router
  .route("/:id/members/:memberId")
  .delete(verifyJWT, authorizeGroupPermission("remove-member"), removeMember);

// Leave Shared Todo
router.route("/:id/leave").delete(verifyJWT, leaveGroupTodo);

export default router;
