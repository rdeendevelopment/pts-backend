const express = require('express');
const router = express.Router();
const workingHoursController = require('../app/Controllers/working_hours.controller');

router.post('/save', workingHoursController.addWeeklyHours);
router.get('/get', workingHoursController.getWeeklyHours);
router.get('/user-weekly', workingHoursController.getUserWeeklyHours);
router.put('/update/:id', workingHoursController.updateWeeklyHours);
router.post('/update-submission', workingHoursController.updateWeekSubmissionStatus);
router.get('/user-weekly-summary/:userId', workingHoursController.getWeeklyTotalSummary);
router.delete('/delete/:id', workingHoursController.deleteWeeklyHours);
router.get('/admin/week-detail', workingHoursController.getAdminWeekDetail);
router.post('/admin/approve', workingHoursController.approveAdminTimesheet);

module.exports = router;
