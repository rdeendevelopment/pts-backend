const { Router } = require('express');
const authenticate = require('../modules/auth/middleware/authenticate');
const { asyncHandler } = require('../kernel/middleware');
const { saveUploadedFiles } = require('../kernel/helpers/localFileUpload.helper');
const { AppError } = require('../kernel/errors');

const router = Router();

router.post('/', authenticate, asyncHandler(async (req, res) => {
  try {
    const savedFiles = await saveUploadedFiles(req.files);
    return res.status(200).json({
      success: true,
      message: 'Files uploaded and saved successfully.',
      savedFiles,
    });
  } catch (error) {
    if (error.status === 400) {
      throw new AppError(error.message, { status: 400 });
    }
    throw error;
  }
}));

module.exports = router;
