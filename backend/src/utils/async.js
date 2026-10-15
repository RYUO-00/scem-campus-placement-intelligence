export const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
export function requireUuid(value, res) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '')) {
    res.status(400).json({ error: 'A valid record ID is required.' }); return false;
  }
  return true;
}
