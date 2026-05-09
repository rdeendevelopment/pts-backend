const MAX_MESSAGE_LENGTH = 4000;

const DANGEROUS_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi,
  /javascript\s*:/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi,
];

function sanitizeText(text) {
  if (typeof text !== 'string') return '';

  let sanitized = text.trim();

  for (const pattern of DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  if (sanitized.length > MAX_MESSAGE_LENGTH) {
    sanitized = sanitized.slice(0, MAX_MESSAGE_LENGTH);
  }

  return sanitized;
}

module.exports = { sanitizeText, MAX_MESSAGE_LENGTH };
