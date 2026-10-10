// Explicit Vercel route for candidate analytics.
const apiHandler = require("../[...path]");

module.exports = function analyticsMineHandler(req, res) {
  const originalUrl = req.url || "";
  const queryIndex = originalUrl.indexOf("?");
  const query = queryIndex >= 0 ? originalUrl.slice(queryIndex) : "";
  // Force the Express API path regardless of Vercel's per-function path rewrite.
  req.url = "/api/analytics/mine" + query;
  return apiHandler(req, res);
};
