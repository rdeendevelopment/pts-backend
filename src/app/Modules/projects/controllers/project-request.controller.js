const { CoreProject, CoreProjectRequest, CoreUser } = require('../MongoModels');

async function nextLegacyId() {
  const row = await CoreProjectRequest.findOne({}, { legacyId: 1 }).sort({ legacyId: -1 }).lean();
  return Number(row?.legacyId || 0) + 1;
}

function serialize(row) {
  const request = row?.toObject ? row.toObject() : row;
  return {
    id: request.legacyId,
    project_id: request.legacyProjectId,
    user_id: request.legacyUserId,
    type: request.type,
    detail: request.detail,
    hours: request.hours,
    project_old_deadline: request.projectOldDeadline,
    project_new_deadline: request.projectNewDeadline,
    status: request.status,
    is_allocate_hours: request.isAllocateHours,
    is_approved: request.isApproved,
    is_deleted: request.isDeleted,
    created_at: request.legacyCreatedAt || request.createdAt,
    updated_at: request.legacyUpdatedAt || request.updatedAt,
  };
}

async function applyApproval(project, request, body, approving) {
  if (!project || !body.is_allocate_hours) return;
  if (approving && !request.isApproved) {
    request.projectOldDeadline = project.deadline;
    if (body.hours) project.hours = (parseFloat(project.hours || 0) + parseFloat(body.hours)).toString();
    if (body.project_new_deadline) project.deadline = new Date(body.project_new_deadline);
    request.isApproved = true;
    await project.save();
  } else if (!approving && request.isApproved) {
    if (body.hours) project.hours = (parseFloat(project.hours || 0) - parseFloat(body.hours)).toString();
    project.deadline = request.projectOldDeadline || project.deadline;
    request.isApproved = false;
    await project.save();
  }
}

exports.save = async function save(req, res) {
  try {
    const body = req.body;
    const [project, user] = await Promise.all([
      CoreProject.findOne({ legacyId: Number(body.project_id) }),
      body.user_id ? CoreUser.findOne({ legacyId: Number(body.user_id) }) : null,
    ]);
    if (!project) return res.status(404).send({ message: 'Project not found.' });
    const request = new CoreProjectRequest({
      legacyId: await nextLegacyId(),
      projectId: project._id,
      userId: user?._id || null,
      legacyProjectId: Number(body.project_id),
      legacyUserId: body.user_id ? Number(body.user_id) : null,
      type: body.type || '',
      detail: body.detail || '',
      hours: body.hours || '',
      projectNewDeadline: body.project_new_deadline ? new Date(body.project_new_deadline) : null,
      status: body.status || '',
      isAllocateHours: Boolean(body.is_allocate_hours),
      isApproved: false,
      isDeleted: false,
      legacyCreatedAt: new Date(),
      legacyUpdatedAt: new Date(),
      migratedAt: new Date(),
    });
    if (body.status === 'approved') await applyApproval(project, request, body, true);
    await request.save();
    return res.send({ message: 'Request saved successfully!', data: serialize(request) });
  } catch (error) {
    console.error(`Error in save method: ${error.message}`);
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};

exports.getAllRequests = async function getAllRequests(req, res) {
  try {
    const requests = await CoreProjectRequest.find({ isDeleted: false }).lean();
    return res.send({ data: requests.map(serialize) });
  } catch (error) {
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};

exports.getProjectAllRequests = async function getProjectAllRequests(req, res) {
  try {
    const requests = await CoreProjectRequest.find({ legacyProjectId: Number(req.params.id), isDeleted: false }).lean();
    return res.send({ data: requests.map(serialize) });
  } catch (error) {
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};

exports.updateRequest = async function updateRequest(req, res) {
  try {
    const body = req.body;
    const request = await CoreProjectRequest.findOne({ legacyId: Number(req.params.id) });
    if (!request) return res.status(404).send({ message: 'Request not found' });
    const project = await CoreProject.findOne({ legacyId: Number(body.project_id || request.legacyProjectId) });
    if (!project) return res.status(404).send({ message: 'Project not found.' });
    if (body.status === 'approved') await applyApproval(project, request, body, true);
    if (body.status === 'rejected') await applyApproval(project, request, body, false);
    Object.assign(request, {
      type: body.type ?? request.type,
      detail: body.detail ?? request.detail,
      hours: body.hours ?? request.hours,
      projectNewDeadline: body.project_new_deadline ? new Date(body.project_new_deadline) : request.projectNewDeadline,
      status: body.status ?? request.status,
      isAllocateHours: body.is_allocate_hours !== undefined ? Boolean(body.is_allocate_hours) : request.isAllocateHours,
      legacyUpdatedAt: new Date(),
    });
    await request.save();
    return res.send({ message: 'Request updated successfully!', data: serialize(request) });
  } catch (error) {
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};

exports.deleteRequest = async function deleteRequest(req, res) {
  try {
    const request = await CoreProjectRequest.findOne({ legacyId: Number(req.params.id) });
    if (!request) return res.status(404).send({ message: 'Request not found' });
    if (request.isApproved) {
      const project = await CoreProject.findOne({ legacyId: request.legacyProjectId });
      if (project) await applyApproval(project, request, { is_allocate_hours: true, hours: request.hours }, false);
    }
    request.isDeleted = true;
    request.legacyUpdatedAt = new Date();
    await request.save();
    return res.send({ message: 'Request deleted successfully!' });
  } catch (error) {
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};
