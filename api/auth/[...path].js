// Explicit auth-route fallback for deployments where the root catch-all
// function is not selected for nested /api/auth/* paths.
const apiHandler = require("../[...path]");

module.exports = function authRouteHandler(req, res) {
  const originalUrl = req.url || "/";
  const pathOnly = originalUrl.split("?")[0];

  // Vercel normally provides the full URL. Normalize only when a deployment
  // adapter has already stripped the /api/auth prefix.
  if (pathOnly === "/api/auth" || pathOnly.startsWith("/api/auth/")) {
    return apiHandler(req, res);
  }

  if (pathOnly === "/auth" || pathOnly.startsWith("/auth/")) {
    req.url = `/api${originalUrl}`;
  } else {
    req.url = `/api/auth${originalUrl.startsWith("/") ? originalUrl : `/${originalUrl}`}`;
  }

  return apiHandler(req, res);
};
