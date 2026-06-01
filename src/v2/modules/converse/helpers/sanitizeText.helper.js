function sanitizeText(value, maxLength = 4000) {
  return String(value || '')
    .replace(/\0/g, '')
    .trim()
    .slice(0, maxLength);
}

module.exports = {
  sanitizeText,
};
