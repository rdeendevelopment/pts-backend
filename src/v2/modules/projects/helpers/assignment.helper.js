function calculateRemainingMinutes(allocatedMinutes, consumedMinutes) {
  const allocated = Math.max(0, Number(allocatedMinutes || 0));
  const consumed = Math.max(0, Number(consumedMinutes || 0));
  return Math.max(0, allocated - consumed);
}

function calculateAvailableToAssignMinutes(totalApprovedMinutes, totalAssignedMinutes) {
  const approved = Math.max(0, Number(totalApprovedMinutes || 0));
  const assigned = Math.max(0, Number(totalAssignedMinutes || 0));
  return Math.max(0, approved - assigned);
}

/**
 * When updating an assignment, add back its current allocation before validating
 * the new allocation against project capacity.
 */
function calculateAvailableForAssignmentUpdate(stats, currentAllocatedMinutes) {
  const baseAvailable = calculateAvailableToAssignMinutes(
    stats.totalApprovedMinutes,
    stats.totalAssignedMinutes
  );
  return baseAvailable + Math.max(0, Number(currentAllocatedMinutes || 0));
}

function assertAllocationWithinAvailable({
  requestedMinutes,
  availableMinutes,
  allowBudgetExceed,
}) {
  const requested = Math.max(0, Number(requestedMinutes || 0));
  const available = Math.max(0, Number(availableMinutes || 0));

  if (allowBudgetExceed || requested <= available) {
    return { allowed: true, requested, available };
  }

  return {
    allowed: false,
    requested,
    available,
  };
}

function defaultCanLogTimeForRole(role) {
  return role !== 'viewer';
}

module.exports = {
  calculateRemainingMinutes,
  calculateAvailableToAssignMinutes,
  calculateAvailableForAssignmentUpdate,
  assertAllocationWithinAvailable,
  defaultCanLogTimeForRole,
};
