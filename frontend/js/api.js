const API_BASE = (() => {
  return window.location.protocol === "file:" ? "http://localhost:5000/api" : "/api";
})();

async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("hiretrack_token");
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers["Content-Type"] = headers["Content-Type"] || "application/json";
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(token && token !== "undefined" ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "The server could not complete this request");
  return result;
}

window.apiRequest = apiRequest;

window.downloadProtectedFile = async function downloadProtectedFile(path, fileName) {
  const token = localStorage.getItem("hiretrack_token");
  const url = path.startsWith("/api/") ? path : `${API_BASE}${path}`;
  const response = await fetch(url, { headers: token && token !== "undefined" ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || "File could not be downloaded");
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
};
