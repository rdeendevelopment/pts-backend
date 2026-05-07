
// const express = require('express');
// const router = express.Router();

// const attachmentsController = require('../app/Controllers/attachments.controller');
// router.post('/save',  attachmentsController.saveUploadedFiles);
// router.get('/project/all/:linkId',  attachmentsController.getProjectAttachments);
// router.put('/delete/:id',  attachmentsController.deleteAttachment);
// module.exports = router;

const express = require('express');
const router = express.Router();

const attachmentsController = require('../app/Controllers/attachments.controller');


router.post('/save', attachmentsController.saveUploadedFiles);
router.get('/project/all/:linkId', attachmentsController.getProjectAttachments);
router.put('/delete/:id', attachmentsController.deleteAttachment);
router.put('/:id/type', attachmentsController.updateAttachmentType);

module.exports = router;