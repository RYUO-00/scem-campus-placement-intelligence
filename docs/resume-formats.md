# Resume format support

Students can upload a `.txt`, `.pdf`, or `.docx` resume from **My profile**. The server extracts text, saves that text to the authenticated student's profile, and returns it to the editor for review. Edit the extracted text and select **Save profile** to keep the edits. Refreshing the profile reloads the saved text from PostgreSQL.

## Limits and validation

- Maximum upload size: 2 MB.
- Maximum extracted or manually entered text: 30,000 characters.
- Maximum PDF length: 100 pages.
- TXT files must be UTF-8 text.
- PDF and DOCX files must have a supported extension and MIME type and contain readable text.
- DOCX extraction runs in a worker thread with a five-second processing limit.
- Empty, malformed, encrypted/password-protected, or mismatched files are rejected with an error; failed uploads do not replace the saved resume.
- PDF text is extracted from the document's text layer. Scanned or image-only PDFs need OCR; this prototype does not provide OCR. Upload a text-based PDF, DOCX, or TXT file instead.
- Uploaded binary files are processed in memory and discarded. Only extracted resume text is stored.

The resume matcher uses this saved text with the selected published drive's job description. Its similarity score measures text overlap only. It does not affect hard eligibility rules and is not a probability of being hired.
