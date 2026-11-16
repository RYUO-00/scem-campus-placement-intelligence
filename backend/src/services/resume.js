import { extname } from 'node:path';
import { Worker } from 'node:worker_threads';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export const MAX_RESUME_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_RESUME_TEXT_CHARACTERS = 30000;
const MAX_PDF_PAGES = 100;
const DOCX_PARSE_TIMEOUT_MS = 5000;

const MIME_TYPES = {
  '.txt': new Set(['text/plain', 'application/octet-stream']),
  '.pdf': new Set(['application/pdf', 'application/x-pdf', 'application/octet-stream']),
  '.docx': new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/octet-stream',
  ]),
};

export function resumeUploadError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.publicMessage = message;
  return error;
}

export function validateResumeUpload(file) {
  const extension = extname(file.originalname || '').toLowerCase();
  const mimeType = String(file.mimetype || '').split(';', 1)[0].trim().toLowerCase();
  const allowedTypes = MIME_TYPES[extension];

  if (!allowedTypes) {
    throw resumeUploadError(415, 'Upload a resume as .txt, .pdf, or .docx.');
  }
  if (!allowedTypes.has(mimeType)) {
    throw resumeUploadError(415, `The file type does not match the ${extension} extension.`);
  }
  return extension;
}

function normalizeText(value) {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/[\t\u00a0 ]+\n/g, '\n')
    .replace(/\n[\t ]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function validateExtractedText(text, extension) {
  const normalized = normalizeText(text);
  if (!normalized) {
    const message = extension === '.pdf'
      ? 'No selectable text was found. A scanned or image-only PDF may need OCR, which is not supported. Try a text-based PDF, DOCX, or TXT file.'
      : extension === '.docx'
        ? 'No readable text was found in this DOCX. Add document text or upload a TXT or PDF resume.'
        : 'Resume text cannot be empty or whitespace.';
    throw resumeUploadError(422, message);
  }
  if (normalized.length > MAX_RESUME_TEXT_CHARACTERS) {
    throw resumeUploadError(413, `Extracted resume text is limited to ${MAX_RESUME_TEXT_CHARACTERS.toLocaleString()} characters.`);
  }
  return normalized;
}

function extractDocxText(buffer) {
  return new Promise((resolve, reject) => {
    let worker;
    let settled = false;
    let timeout;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
      if (worker) void worker.terminate();
    };

    try {
      const data = Uint8Array.from(buffer);
      worker = new Worker(new URL('./resume-docx-worker.js', import.meta.url), {
        workerData: data.buffer,
        transferList: [data.buffer],
        resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
      });
    } catch {
      reject(resumeUploadError(422, 'We could not start the DOCX text parser. Try a TXT or PDF resume instead.'));
      return;
    }

    timeout = setTimeout(() => {
      finish(reject, resumeUploadError(422, 'DOCX text extraction took too long. Re-save the document or upload a TXT/PDF resume.'));
    }, DOCX_PARSE_TIMEOUT_MS);
    worker.once('message', (message) => {
      if (!message?.ok || typeof message.text !== 'string') {
        finish(reject, resumeUploadError(422, 'We could not read this DOCX. Check that it is not corrupt or password-protected, then try again.'));
        return;
      }
      finish(resolve, message.text);
    });
    worker.once('error', () => {
      finish(reject, resumeUploadError(422, 'We could not read this DOCX. Check that it is not corrupt or password-protected, then try again.'));
    });
    worker.once('exit', (code) => {
      if (!settled && code !== 0) {
        finish(reject, resumeUploadError(422, 'We could not read this DOCX. Check that it is not corrupt or password-protected, then try again.'));
      }
    });
  });
}

async function extractPdf(buffer) {
  if (buffer.subarray(0, 1024).indexOf(Buffer.from('%PDF-')) === -1) {
    throw resumeUploadError(422, 'This file does not appear to be a valid PDF.');
  }

  const loadingTask = getDocument({ data: Uint8Array.from(buffer), isEvalSupported: false, stopAtErrors: true, verbosity: 0 });
  let document;
  try {
    document = await loadingTask.promise;
    if (document.numPages > MAX_PDF_PAGES) {
      throw resumeUploadError(413, `PDF resumes are limited to ${MAX_PDF_PAGES} pages.`);
    }

    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent({ includeMarkedContent: false });
      pages.push(content.items
        .filter((item) => typeof item.str === 'string')
        .map((item) => `${item.str}${item.hasEOL ? '\n' : ' '}`)
        .join(''));
      page.cleanup();
    }
    return validateExtractedText(pages.join('\n'), '.pdf');
  } catch (error) {
    if (error?.status) throw error;
    if (error?.name === 'PasswordException') {
      throw resumeUploadError(422, 'Password-protected PDFs are not supported. Upload an unlocked PDF, DOCX, or TXT file.');
    }
    throw resumeUploadError(422, 'We could not read this PDF. Check that it is not corrupt or password-protected, then try again.');
  } finally {
    await loadingTask.destroy().catch(() => {});
  }
}

export async function extractResumeText(buffer, extension) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw resumeUploadError(422, 'The selected resume file is empty. Choose a non-empty TXT, PDF, or DOCX file.');
  }

  if (extension === '.txt') {
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      throw resumeUploadError(422, 'This TXT file is not valid UTF-8 text. Save it as UTF-8 and try again.');
    }
    return validateExtractedText(text, '.txt');
  }

  if (extension === '.pdf') return extractPdf(buffer);

  if (extension === '.docx') {
    try {
      if (buffer.subarray(0, 2).toString('binary') !== 'PK') {
        throw new Error('Invalid DOCX container');
      }
      return validateExtractedText(await extractDocxText(buffer), '.docx');
    } catch (error) {
      if (error?.status) throw error;
      throw resumeUploadError(422, 'We could not read this DOCX. Check that it is not corrupt or password-protected, then try again.');
    }
  }

  throw resumeUploadError(415, 'Upload a resume as .txt, .pdf, or .docx.');
}
