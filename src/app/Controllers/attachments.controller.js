const { CoreAttachment } = require('../MongoModels');

async function nextLegacyId() {
  const row = await CoreAttachment.findOne({}, { legacyId: 1 }).sort({ legacyId: -1 }).lean();
  return Number(row?.legacyId || 0) + 1;
}

function serialize(file) {
  const row = file?.toObject ? file.toObject() : file;
  return {
    id: row.legacyId,
    title: row.title,
    size: row.size,
    url: row.url,
    status: row.status,
    type: row.type,
    link_id: row.linkId,
    is_deleted: row.isDeleted,
    created_at: row.legacyCreatedAt || row.createdAt,
    updated_at: row.legacyUpdatedAt || row.updatedAt,
  };
}

exports.saveUploadedFiles = async (req, res) => {
  try {
    const { files, link_id } = req.body;
    const allFiles = typeof files === 'string' ? JSON.parse(files) : files;
    if (!Array.isArray(allFiles) || allFiles.length === 0) return res.status(400).json({ message: 'No valid files to save.' });
    let nextId = await nextLegacyId();
    const savedFiles = await CoreAttachment.insertMany(allFiles.map((file) => ({
      legacyId: nextId++,
      title: file.title || '',
      size: file.size || '',
      url: file.url || '',
      status: file.status || 'Uploaded',
      type: file.type || 'private',
      linkId: String(link_id || ''),
      isDeleted: false,
      legacyCreatedAt: new Date(),
      legacyUpdatedAt: new Date(),
      migratedAt: new Date(),
    })));
    return res.status(200).json({ message: 'Files uploaded and saved successfully!', files: savedFiles.map(serialize) });
  } catch (error) {
    console.error('Error saving files to the database:', error);
    return res.status(500).json({ message: 'Failed to save files to the database.', error: error.message });
  }
};

exports.getProjectAttachments = async function getProjectAttachments(req, res) {
  try {
    const rows = await CoreAttachment.find({ linkId: String(req.params.linkId), isDeleted: false }).lean();
    return res.send({ data: rows.map(serialize) });
  } catch (error) {
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};

exports.deleteAttachment = async function deleteAttachment(req, res) {
  try {
    const attachment = await CoreAttachment.findOneAndUpdate(
      { legacyId: Number(req.params.id) },
      { $set: { isDeleted: true, legacyUpdatedAt: new Date() } },
      { new: true }
    );
    if (!attachment) return res.status(404).send({ message: 'Attachment not found' });
    return res.send({ message: 'Attachment deleted successfully' });
  } catch (error) {
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};

exports.updateAttachmentType = async function updateAttachmentType(req, res) {
  try {
    const attachment = await CoreAttachment.findOneAndUpdate(
      { legacyId: Number(req.params.id), isDeleted: false },
      { $set: { type: req.body.type, legacyUpdatedAt: new Date() } },
      { new: true }
    );
    if (!attachment) return res.status(404).send({ message: 'Attachment not found' });
    return res.send({ message: 'Attachment type updated successfully', data: serialize(attachment) });
  } catch (error) {
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};
