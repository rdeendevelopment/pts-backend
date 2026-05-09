function makeDirectKey(userIdA, userIdB) {
  const ids = [String(userIdA), String(userIdB)].sort();
  return `${ids[0]}:${ids[1]}`;
}

module.exports = { makeDirectKey };
