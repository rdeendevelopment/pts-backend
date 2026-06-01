const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const roleService = require('../services/role.service');
const permissionService = require('../services/permission.service');
const accountRoleService = require('../services/accountRole.service');

async function listRoles(req, res) {
  const data = await roleService.listRoles();
  return sendSuccess(res, data);
}

async function getRole(req, res) {
  const roleId = assertObjectId(req.params.id, 'id');
  const data = await roleService.getRoleById(roleId);
  return sendSuccess(res, data);
}

async function createRole(req, res) {
  const data = await roleService.createRole(req.body);
  return sendSuccess(res, data, { status: 201 });
}

async function updateRole(req, res) {
  const roleId = assertObjectId(req.params.id, 'id');
  const data = await roleService.updateRole(roleId, req.body);
  return sendSuccess(res, data);
}

async function deleteRole(req, res) {
  const roleId = assertObjectId(req.params.id, 'id');
  const data = await roleService.deleteRole(roleId);
  return sendSuccess(res, data);
}

async function listPermissions(req, res) {
  const data = await permissionService.listPermissions();
  return sendSuccess(res, data);
}

async function listAccountRoles(req, res) {
  const accountId = assertObjectId(req.params.accountId, 'accountId');
  const data = await accountRoleService.listAccountRoles(accountId);
  return sendSuccess(res, data);
}

async function assignAccountRole(req, res) {
  const accountId = assertObjectId(req.params.accountId, 'accountId');
  const payload = {
    ...req.body,
    roleId: req.body.roleId || req.body.role_id,
  };
  const data = await accountRoleService.assignAccountRole(
    accountId,
    payload,
    req.v2Auth.accountId
  );
  return sendSuccess(res, data, { status: 201 });
}

async function removeAccountRole(req, res) {
  const accountId = assertObjectId(req.params.accountId, 'accountId');
  const roleId = assertObjectId(req.params.roleId, 'roleId');
  const data = await accountRoleService.removeAccountRole(accountId, roleId);
  return sendSuccess(res, data);
}

module.exports = {
  listRoles: asyncHandler(listRoles),
  getRole: asyncHandler(getRole),
  createRole: asyncHandler(createRole),
  updateRole: asyncHandler(updateRole),
  deleteRole: asyncHandler(deleteRole),
  listPermissions: asyncHandler(listPermissions),
  listAccountRoles: asyncHandler(listAccountRoles),
  assignAccountRole: asyncHandler(assignAccountRole),
  removeAccountRole: asyncHandler(removeAccountRole),
};
