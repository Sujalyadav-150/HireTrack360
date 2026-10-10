// Explicit Vercel route for candidate analytics.
const apiHandler = require("../[...path]");

module.exports = function analyticsMineHandler(req, res) {
  const originalUrl = req.url || "";
  const queryIndex = originalUrl.indexOf("?");
  const query = queryIndex >= 0 ? originalUrl.slice(queryIndex) : "";
  // Explicit API functions can receive either a prefix-stripped path or the
  // original /api path. The shared handler then normalizes to Express routes.
  req.url = "/api/analytics/mine" + query;
  return apiHandler(req, res);
};
