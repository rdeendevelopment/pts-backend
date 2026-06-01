const { buildSourceHash } = require('../helpers/migrationBase.helper');

function transformLegacyProjectAttachment(doc, projectId) {
  if (!projectId) {
    return {
      error: {
        code: 'ATTACHMENT_PROJECT_MISSING',
        message: 'Attachment project could not be resolved.',
      },
    };
  }

  const fileUrl = String(doc.url || '').trim();
  if (!fileUrl) {
    return {
      error: {
        code: 'ATTACHMENT_URL_MISSING',
        message: 'Attachment is missing a file URL.',
      },
    };
  }

  const fileName = String(doc.title || '').trim()
    || fileUrl.split('/').pop()
    || 'attachment';

  const fileSizeRaw = Number(doc.size);
  const fileSize = Number.isFinite(fileSizeRaw) && fileSizeRaw >= 0 ? fileSizeRaw : null;

  return {
    payload: {
      projectId,
      fileName,
      fileUrl,
      fileType: doc.mimeType ? String(doc.mimeType).trim() : null,
      fileSize,
      isDeleted: Boolean(doc.isDeleted),
      deletedAt: doc.isDeleted ? doc.updatedAt || new Date() : null,
    },
    sourceHash: buildSourceHash(doc, 'attachments'),
    legacyId: doc.legacyId ?? null,
    oldObjectId: doc._id,
  };
}

function isProjectAttachment(doc) {
  return String(doc.parentType || '').trim().toLowerCase() === 'project'
    && Boolean(doc.parentId);
}

module.exports = {
  transformLegacyProjectAttachment,
  isProjectAttachment,
};
