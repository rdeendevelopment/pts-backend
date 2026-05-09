const attachmentService = require('../services/attachment.service');

// Multer fileFilter: rejects files whose extension OR declared mime-type is not allowed.
// Note: this relies on multer's mimetype (client-supplied) PLUS extension cross-check.
// For stricter validation, add a magic-byte checker library (e.g. file-type) to the pipeline.

function converseFileFilter(req, file, cb) {
  if (attachmentService.isAllowed(file.mimetype, file.originalname)) {
    return cb(null, true);
  }
  const ext = attachmentService.getExtension(file.originalname);
  cb(
    Object.assign(
      new Error(
        `File type not allowed. Extension: .${ext}, MIME: ${file.mimetype}. ` +
        `Allowed: ${[...attachmentService.ALLOWED_EXTENSIONS].join(', ')}`
      ),
      { statusCode: 415 }
    ),
    false
  );
}

module.exports = { converseFileFilter };
