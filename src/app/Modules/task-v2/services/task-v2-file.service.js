/**
 * Local file storage + validation for Task V2 attachments (task-level + comment uploads).
 * Uses express-fileupload (req.files) — same pattern as Converse attachments.
 */
const path = require('path');
const fs = require('fs');

const TASK_V2_URL_PREFIX = '/uploads/task-v2/';

const ALLOWED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif',
  'pdf',
  'doc', 'docx',
  'txt',
  'csv',
  'xls', 'xlsx',
  'zip',
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
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
]);

const MAX_SIZE_BYTES =
  Math.max(1, parseInt(process.env.TASK_V2_MAX_FILE_SIZE_MB || '25', 10)) * 1024 * 1024;

function getExtension(filename) {
  return path.extname(String(filename || '')).slice(1).toLowerCase();
}

function sanitizeFileName(originalName) {
  const base = path.basename(String(originalName || 'file'));
  return (
    base
      .replace(/[^\w.\-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .replace(/^[.\-]+/, '')
      .slice(0, 200) || 'file'
  );
}

function isAllowed(mimetype, originalname) {
  const ext = getExtension(originalname);
  if (!ALLOWED_EXTENSIONS.has(ext)) return false;
  const mime = String(mimetype || '').toLowerCase();
  return ALLOWED_MIMETYPES.has(mime);
}

function getStorageRelPath() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return path.join('uploads', 'task-v2', String(year), month);
}

function buildPublicUrl(storageKey) {
  const urlPath = storageKey.replace(/\\/g, '/');
  return urlPath.startsWith('/') ? urlPath : `/${urlPath}`;
}

/**
 * @param file express-fileupload UploadedFile
 */
async function persistExpressFileUpload(file) {
  const relDir = getStorageRelPath();
  const absDir = path.join(process.cwd(), relDir);
  fs.mkdirSync(absDir, { recursive: true });
  const sanitized = sanitizeFileName(file.name);
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${sanitized}`;
  const absPath = path.join(absDir, unique);
  const storageKey = path.join(relDir, unique).replace(/\\/g, '/');
  await file.mv(absPath);
  return {
    name: file.name,
    mimeType: file.mimetype || '',
    size: file.size || 0,
    url: buildPublicUrl(storageKey),
    storageKey,
  };
}

/** Accept only URLs served from our task-v2 upload tree */
function isTaskV2UploadUrl(url) {
  const u = String(url || '').trim();
  if (!u) return false;
  const normalized = u.startsWith('/') ? u : `/${u}`;
  return normalized.startsWith(TASK_V2_URL_PREFIX);
}

async function deletePhysicalFileByPublicUrl(publicUrl) {
  const raw = String(publicUrl || '').trim().replace(/^\/+/, '');
  if (!raw.startsWith('uploads/task-v2/')) return;
  const abs = path.join(process.cwd(), raw);
  try {
    await fs.promises.unlink(abs);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

module.exports = {
  TASK_V2_URL_PREFIX,
  MAX_SIZE_BYTES,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIMETYPES,
  isAllowed,
  persistExpressFileUpload,
  isTaskV2UploadUrl,
  deletePhysicalFileByPublicUrl,
};
