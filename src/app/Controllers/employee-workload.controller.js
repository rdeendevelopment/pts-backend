const employeeWorkloadService = require('../Services/employee-workload.service');

exports.getEmployeeWorkload = async (req, res) => {
  try {
    const data = await employeeWorkloadService.getEmployeeWorkload(
      req.auth.user,
      req.params.id,
      req.auth,
      req.query
    );
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};
