// Explicit Vercel route to avoid catch-all routing misses for nested API paths.
const apiHandler = require("../[...path]");

module.exports = function routeHandler(req, res) {
  const originalUrl = req.url || "";
  const queryIndex = originalUrl.indexOf("?");
  const query = queryIndex >= 0 ? originalUrl.slice(queryIndex) : "";
  req.url = "/api/recruiter/jobs" + query;
  return apiHandler(req, res);
};
