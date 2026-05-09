const path = require('path');
const fs = require('fs');
const attachmentService = require('../services/attachment.service');

exports.upload = async function upload(req, res) {
  try {
    // express-fileupload (global middleware) populates req.files
    const file = req.files?.file;
    if (!file) {
      return res.status(400).send({ message: 'No file provided. Use field name "file".' });
    }

    if (file.size > attachmentService.MAX_SIZE_BYTES) {
      const limitMB = Math.round(attachmentService.MAX_SIZE_BYTES / (1024 * 1024));
      return res.status(413).send({ message: `File too large. Maximum size is ${limitMB} MB.` });
    }

    if (!attachmentService.isAllowed(file.mimetype, file.name)) {
      return res.status(415).send({ message: 'File type not allowed.' });
    }

    const relDir = attachmentService.getStorageRelPath();
    const absDir = path.join(process.cwd(), relDir);
    fs.mkdirSync(absDir, { recursive: true });

    const sanitized = attachmentService.sanitizeFileName(file.name);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${sanitized}`;
    const absPath = path.join(absDir, unique);
    const storageKey = path.join(relDir, unique).replace(/\\/g, '/');

    await file.mv(absPath);

    // Adapt express-fileupload shape to what buildMetadata expects
    const meta = attachmentService.buildMetadata(
      { originalname: file.name, mimetype: file.mimetype, size: file.size },
      storageKey,
    );

    return res.status(201).send({ message: 'File uploaded successfully', data: meta });
  } catch (err) {
    console.error('[converse/attachment] upload error:', err.message);
    return res.status(500).send({ message: 'Internal server error', error: err.message });
  }
};
