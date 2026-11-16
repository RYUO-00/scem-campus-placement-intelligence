import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractResumeText, resumeUploadError, validateResumeUpload } from '../src/services/resume.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const samplePdf = await readFile(join(fixtures, 'sample.pdf'));
const encryptedPdf = await readFile(join(fixtures, 'encrypted.pdf'));
const imageOnlyPdf = await readFile(join(fixtures, 'image-only.pdf'));
const malformedPdf = await readFile(join(fixtures, 'malformed.pdf'));
const sampleDocx = await readFile(join(fixtures, 'sample.docx'));
const emptyDocx = await readFile(join(fixtures, 'empty.docx'));

test('validates supported resume extensions and MIME types', () => {
  assert.equal(validateResumeUpload({ originalname: 'resume.TXT', mimetype: 'text/plain' }), '.txt');
  assert.equal(validateResumeUpload({ originalname: 'resume.pdf', mimetype: 'application/pdf' }), '.pdf');
  assert.equal(validateResumeUpload({ originalname: 'resume.docx', mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), '.docx');
  assert.equal(validateResumeUpload({ originalname: 'resume.pdf', mimetype: 'application/octet-stream' }), '.pdf');
  assert.throws(() => validateResumeUpload({ originalname: 'resume.exe', mimetype: 'application/octet-stream' }), { status: 415 });
  assert.throws(() => validateResumeUpload({ originalname: 'resume.pdf', mimetype: 'text/plain' }), { status: 415 });
});

test('extracts text from TXT, PDF, and DOCX documents', async () => {
  const txt = await extractResumeText(Buffer.from('\uFEFFResume parsing test\nSkills: Python, SQL'), '.txt');
  const pdf = await extractResumeText(samplePdf, '.pdf');
  const docx = await extractResumeText(sampleDocx, '.docx');

  assert.match(txt, /Skills: Python, SQL/);
  assert.match(pdf, /Python SQL REST APIs/);
  assert.match(docx, /Python, SQL, REST APIs/);
});

test('rejects empty, malformed, image-only, and invalid-encoding resumes with useful errors', async () => {
  await assert.rejects(extractResumeText(Buffer.alloc(0), '.txt'), { status: 422, message: 'The selected resume file is empty. Choose a non-empty TXT, PDF, or DOCX file.' });
  await assert.rejects(extractResumeText(Buffer.from([0xff, 0xfe]), '.txt'), { status: 422, message: 'This TXT file is not valid UTF-8 text. Save it as UTF-8 and try again.' });
  await assert.rejects(extractResumeText(malformedPdf, '.pdf'), { status: 422 });
  await assert.rejects(extractResumeText(encryptedPdf, '.pdf'), { status: 422, message: /Password-protected PDFs are not supported/ });
  await assert.rejects(extractResumeText(imageOnlyPdf, '.pdf'), { status: 422, message: /scanned or image-only PDF.*OCR/ });
  await assert.rejects(extractResumeText(Buffer.from('  \n\t'), '.txt'), { status: 422, message: 'Resume text cannot be empty or whitespace.' });
  await assert.rejects(extractResumeText(emptyDocx, '.docx'), { status: 422, message: /No readable text was found in this DOCX/ });
  await assert.rejects(extractResumeText(Buffer.from('not-a-zip'), '.docx'), { status: 422 });
  await assert.rejects(extractResumeText(Buffer.from('x'.repeat(30001)), '.txt'), { status: 413 });
});

test('returns a typed request error without including document contents', () => {
  const error = resumeUploadError(413, 'Resume text is too long.');
  assert.equal(error.status, 413);
  assert.equal(error.publicMessage, 'Resume text is too long.');
  assert.equal(error.message, 'Resume text is too long.');
});
