function minutesToHours(minutes) {
  const value = Number(minutes || 0);
  return Math.round((value / 60) * 100) / 100;
}

module.exports = {
  minutesToHours,
};
