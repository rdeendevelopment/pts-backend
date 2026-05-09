const path = require('path');

// ─── Allowed types (both extension AND declared mime must match) ───────────────

const ALLOWED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif',
  'pdf', 'doc', 'docx', 'txt', 'xlsx',
  'mp4', 'webm', 'ogv', 'mov',
]);

const ALLOWED_MIMETYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
]);

// ─── Configurable max file size (env: CONVERSE_MAX_FILE_SIZE_MB, default 200) ──

const MAX_SIZE_BYTES =
  Math.max(1, parseInt(process.env.CONVERSE_MAX_FILE_SIZE_MB || '200', 10)) * 1024 * 1024;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getExtension(filename) {
  return path.extname(String(filename || '')).slice(1).toLowerCase();
}

function sanitizeFileName(originalName) {
  const base = path.basename(String(originalName || 'file'));
  return base
    .replace(/[^\w.\-]/g, '_')  // keep word chars, dots, hyphens
    .replace(/\.{2,}/g, '.')    // collapse double-dots (path traversal guard)
    .replace(/^[.\-]+/, '')     // strip leading dots/dashes
    .slice(0, 200) || 'file';
}

function isAllowed(mimetype, originalname) {
  const ext = getExtension(originalname);
  return ALLOWED_EXTENSIONS.has(ext) && ALLOWED_MIMETYPES.has(String(mimetype).toLowerCase());
}

function getStorageRelPath() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return path.join('uploads', 'converse', String(year), month);
}

function buildMetadata(file, storageKey) {
  // Normalise path separators for URL usage
  const urlPath = storageKey.replace(/\\/g, '/');
  return {
    fileName: file.originalname || '',
    mimeType: file.mimetype || '',
    size: file.size || 0,
    storageKey,
    provider: 'local',
    url: `/${urlPath}`,
  };
}

module.exports = {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIMETYPES,
  MAX_SIZE_BYTES,
  getExtension,
  sanitizeFileName,
  isAllowed,
  getStorageRelPath,
  buildMetadata,
};
