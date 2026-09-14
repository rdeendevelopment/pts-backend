const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const uploadDirectory = path.resolve('src/storage/uploads');

function ensureUploadDirectory() {
  if (!fs.existsSync(uploadDirectory)) {
    fs.mkdirSync(uploadDirectory, { recursive: true });
  }
}

function normalizeUploadedFiles(filesInput) {
  if (!filesInput) return [];
  const files = filesInput.files || filesInput.file || filesInput;
  if (!files) return [];
  return Array.isArray(files) ? files : [files];
}

async function saveUploadedFiles(filesInput, options = {}) {
  const files = normalizeUploadedFiles(filesInput);
  if (!files.length) {
    const err = new Error('No files were uploaded.');
    err.status = 400;
    throw err;
  }

  const allowedExtensions = options.allowedExtensions || null;
  if (options.maxFiles && files.length > options.maxFiles) {
    const err = new Error(`Upload at most ${options.maxFiles} files.`);
    err.status = 400;
    throw err;
  }
  for (const file of files) {
    const extension = path.extname(String(file.name || '')).slice(1).toLowerCase();
    if ((allowedExtensions && !allowedExtensions.includes(extension))
      || (options.maxSizeBytes && Number(file.size || 0) > options.maxSizeBytes)) {
      const err = new Error('Unsupported file type or file exceeds the upload limit.');
      err.status = 400;
      throw err;
    }
  }

  ensureUploadDirectory();

  const savedFiles = [];
  for (const file of files) {
    const safeName = path.basename(String(file.name || 'file')).replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueFilename = `${crypto.randomUUID()}-${safeName}`;
    const filePath = path.join(uploadDirectory, uniqueFilename);
    await file.mv(filePath);
    savedFiles.push({
      title: file.name,
      size: file.size,
      url: `/uploads/${uniqueFilename}`,
    });
  }

  return savedFiles;
}

module.exports = {
  uploadDirectory,
  normalizeUploadedFiles,
  saveUploadedFiles,
};
