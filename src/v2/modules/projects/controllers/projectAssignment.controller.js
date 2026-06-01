const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const projectAssignmentService = require('../services/projectAssignment.service');

async function listAssignments(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const data = await projectAssignmentService.listAssignments(projectId);
  return sendSuccess(res, { items: data });
}

async function createAssignment(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const body = { ...req.body, userId: assertObjectId(req.body.userId, 'userId') };
  const data = await projectAssignmentService.createAssignment(
    projectId,
    body,
    req.v2Auth.accountId,
    req
  );
  return sendSuccess(res, data, { status: 201 });
}

async function updateAssignment(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const assignmentId = assertObjectId(req.params.assignmentId, 'assignmentId');
  const body = { ...req.body };
  if (body.userId) body.userId = assertObjectId(body.userId, 'userId');
  const data = await projectAssignmentService.updateAssignment(
    projectId,
    assignmentId,
    body,
    req.v2Auth.accountId,
    req
  );
  return sendSuccess(res, data);
}

async function removeAssignment(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const assignmentId = assertObjectId(req.params.assignmentId, 'assignmentId');
  const data = await projectAssignmentService.removeAssignment(
    projectId,
    assignmentId,
    req.v2Auth.accountId,
    req
  );
  return sendSuccess(res, data);
}

module.exports = {
  listAssignments: asyncHandler(listAssignments),
  createAssignment: asyncHandler(createAssignment),
  updateAssignment: asyncHandler(updateAssignment),
  removeAssignment: asyncHandler(removeAssignment),
};
