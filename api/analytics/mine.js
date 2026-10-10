// Explicit Vercel route for candidate analytics.
// The shared handler normalizes either path form to Express' /api route.
const apiHandler = require("../[...path]");

module.exports = function analyticsMineHandler(req, res) {
  return apiHandler(req, res);
};
