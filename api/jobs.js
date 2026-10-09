// Explicit Vercel function for the public job listings endpoint.
// Keep this route separate from the catch-all so /api/jobs is always deployed.
const apiHandler = require("./[...path]");

module.exports = function jobsHandler(req, res) {
  const originalUrl = req.url || "";
  const queryIndex = originalUrl.indexOf("?");
  const query = queryIndex >= 0 ? originalUrl.slice(queryIndex) : "";
  req.url = "/api/jobs" + query;
  return apiHandler(req, res);
};
