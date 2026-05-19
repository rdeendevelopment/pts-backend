/**
 * Project Module Validators
 * Input validation for all project-related operations
 *
 * Provides centralized validation for:
 * - Project creation and updates
 * - User assignments
 * - Budget operations
 * - Project requests
 */

/**
 * Custom error class for validation errors
 */
class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.status = 400;
  }
}

/**
 * Validate project creation/update data
 */
function validateProject(data = {}) {
  const errors = {};

  // Title validation
  if (data.title !== undefined) {
    const title = String(data.title || '').trim();
    if (!title) {
      errors.title = 'Project title is required';
    }
    if (title.length > 255) {
      errors.title = 'Project title must be 255 characters or less';
    }
  }

  // Client validation
  if (data.client_id !== undefined && data.client_id !== null) {
    const clientId = Number(data.client_id);
    if (Number.isNaN(clientId) || clientId < 1) {
      errors.client_id = 'Invalid client ID';
    }
  }

  // Project type validation
  if (data.project_type) {
    const validTypes = ['fixed_hours', 'fixed_budget', 'retainer', 'hybrid', 'internal'];
    if (!validTypes.includes(data.project_type)) {
      errors.project_type = `Project type must be one of: ${validTypes.join(', ')}`;
    }
  }

  // Retainer hours validation
  if (data.retainer_hours_per_month !== undefined && data.retainer_hours_per_month !== null) {
    const hours = Number(data.retainer_hours_per_month);
    if (Number.isNaN(hours) || hours < 1) {
      errors.retainer_hours_per_month = 'Retainer hours must be a positive number';
    }
  }

  // Fixed hours validation
  if (data.hours !== undefined && data.hours !== null) {
    const hours = Number(data.hours);
    if (Number.isNaN(hours) || hours < 1) {
      errors.hours = 'Hours must be a positive number';
    }
  }

  // Budget amount validation
  if (data.budget_amount !== undefined && data.budget_amount !== null) {
    const amount = Number(data.budget_amount);
    if (Number.isNaN(amount) || amount < 1) {
      errors.budget_amount = 'Budget amount must be a positive number';
    }
  }

  // Deadline validation
  if (data.deadline !== undefined && data.deadline !== null) {
    const date = new Date(data.deadline);
    if (Number.isNaN(date.getTime())) {
      errors.deadline = 'Invalid deadline date';
    }
  }

  // Status validation
  if (data.status) {
    const validStatuses = ['pending', 'active', 'completed', 'on_hold'];
    if (!validStatuses.includes(data.status)) {
      errors.status = `Status must be one of: ${validStatuses.join(', ')}`;
    }
  }

  if (Object.keys(errors).length > 0) {
    const err = new ValidationError('Project validation failed');
    err.errors = errors;
    throw err;
  }
}

/**
 * Validate project assignment (user assignment to project)
 */
function validateAssignment(data = {}) {
  const errors = {};

  // Project ID required
  if (!data.project_id && !data.projectId) {
    errors.project_id = 'Project ID is required';
  }

  // User ID required
  if (!data.user_id && !data.userId) {
    errors.user_id = 'User ID is required';
  }

  // Hours cap validation (optional)
  if (data.hours_cap_minutes !== undefined && data.hours_cap_minutes !== null) {
    const minutes = Number(data.hours_cap_minutes);
    if (Number.isNaN(minutes) || minutes < 0) {
      errors.hours_cap_minutes = 'Hours cap must be a non-negative number';
    }
  }

  // Cap period validation
  if (data.cap_period) {
    const validPeriods = ['none', 'day', 'week', 'month', 'project'];
    if (!validPeriods.includes(data.cap_period)) {
      errors.cap_period = `Cap period must be one of: ${validPeriods.join(', ')}`;
    }
  }

  if (Object.keys(errors).length > 0) {
    const err = new ValidationError('Assignment validation failed');
    err.errors = errors;
    throw err;
  }
}

/**
 * Validate budget creation/update
 */
function validateBudget(data = {}) {
  const errors = {};

  // Name required
  if (!data.name) {
    errors.name = 'Budget name is required';
  }

  // Budget type validation
  if (data.budget_type) {
    const validTypes = ['fixed', 'retainer', 'phase'];
    if (!validTypes.includes(data.budget_type)) {
      errors.budget_type = `Budget type must be one of: ${validTypes.join(', ')}`;
    }
  }

  // Allocated minutes validation
  if (data.allocated_minutes !== undefined && data.allocated_minutes !== null) {
    const minutes = Number(data.allocated_minutes);
    if (Number.isNaN(minutes) || minutes < 0) {
      errors.allocated_minutes = 'Allocated minutes must be non-negative';
    }
  }

  // Warning threshold validation
  if (data.warning_threshold_percent !== undefined) {
    const percent = Number(data.warning_threshold_percent);
    if (Number.isNaN(percent) || percent < 0 || percent > 100) {
      errors.warning_threshold_percent = 'Warning threshold must be between 0 and 100';
    }
  }

  // Date range validation
  if (data.start_date && data.end_date) {
    const start = new Date(data.start_date);
    const end = new Date(data.end_date);
    if (start > end) {
      errors.date_range = 'Start date must be before end date';
    }
  }

  if (Object.keys(errors).length > 0) {
    const err = new ValidationError('Budget validation failed');
    err.errors = errors;
    throw err;
  }
}

/**
 * Validate project request creation
 */
function validateProjectRequest(data = {}) {
  const errors = {};

  // Title required
  if (!data.title) {
    errors.title = 'Request title is required';
  }

  // Type validation
  if (data.request_type) {
    const validTypes = ['additional_hours', 'phase_extension', 'scope_change'];
    if (!validTypes.includes(data.request_type)) {
      errors.request_type = `Request type must be one of: ${validTypes.join(', ')}`;
    }
  }

  // Hours validation
  if (data.requested_hours !== undefined && data.requested_hours !== null) {
    const hours = Number(data.requested_hours);
    if (Number.isNaN(hours) || hours < 1) {
      errors.requested_hours = 'Requested hours must be a positive number';
    }
  }

  if (Object.keys(errors).length > 0) {
    const err = new ValidationError('Project request validation failed');
    err.errors = errors;
    throw err;
  }
}

/**
 * Validate pagination parameters
 */
function validatePagination(data = {}) {
  const errors = {};

  if (data.page !== undefined) {
    const page = Number(data.page);
    if (Number.isNaN(page) || page < 1) {
      errors.page = 'Page must be a positive number';
    }
  }

  if (data.limit !== undefined) {
    const limit = Number(data.limit);
    if (Number.isNaN(limit) || limit < 1 || limit > 5000) {
      errors.limit = 'Limit must be between 1 and 5000';
    }
  }

  if (Object.keys(errors).length > 0) {
    const err = new ValidationError('Pagination validation failed');
    err.errors = errors;
    throw err;
  }
}

module.exports = {
  ValidationError,
  validateProject,
  validateAssignment,
  validateBudget,
  validateProjectRequest,
  validatePagination,
};
