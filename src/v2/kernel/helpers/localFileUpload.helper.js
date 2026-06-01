const path = require('path');
const fs = require('fs');

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

async function saveUploadedFiles(filesInput) {
  const files = normalizeUploadedFiles(filesInput);
  if (!files.length) {
    const err = new Error('No files were uploaded.');
    err.status = 400;
    throw err;
  }

  ensureUploadDirectory();

  const savedFiles = [];
  for (const file of files) {
    const uniqueFilename = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${String(file.name || 'file').replace(/\s+/g, '_')}`;
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
