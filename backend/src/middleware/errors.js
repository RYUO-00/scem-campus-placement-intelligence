export function notFound(req, res) { res.status(404).json({ error: `No route for ${req.method} ${req.path}` }); }
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'The upload is larger than the 5 MB limit.' });
  if (error?.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ error: 'Upload a single file using the file field.' });
  if (error?.name === 'MulterError') return res.status(400).json({ error: error.message });
  console.error(error);
  return res.status(error.status || 500).json({ error: error.publicMessage || 'Something went wrong. Please try again.' });
}
