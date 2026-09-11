// Vercel's Node.js builder auto-detects files under /api as serverless
// functions. This re-exports the Express app from server/index.js — see
// vercel.json, which rewrites every request to this one function so the
// app's own routing (static files, SPA fallback, /api/*) handles
// everything, exactly as it does under traditional hosting.
module.exports = require('../server/index.js');
