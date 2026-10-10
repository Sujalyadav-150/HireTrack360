// Explicit Vercel route for candidate analytics.
// Preserve the original path because the shared handler already normalizes
// both /api/... and prefix-stripped requests.
const apiHandler = require("../[...path]");

module.exports = function analyticsMineHandler(req, res) {
  const originalUrl = req.url || "/analytics/mine";
  const pathOnly = originalUrl.split("?")[0];
  if (pathOnly !== "/api/analytics/mine" && pathOnly !== "/analytics/mine") {
    req.url = "/api/analytics/mine" + (originalUrl.includes("?") ? originalUrl.slice(originalUrl.indexOf("?")) : "");
  }
  return apiHandler(req, res);
};
