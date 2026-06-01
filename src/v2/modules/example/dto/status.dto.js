/**
 * Example module — structural reference only.
 * Replace with real modules (auth, users, projects, …) in later phases.
 */

function toStatusDto(payload) {
  return {
    module: payload.module,
    status: payload.status,
    message: payload.message,
  };
}

module.exports = {
  toStatusDto,
};
