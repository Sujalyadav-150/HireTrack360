const API_BASE = "http://localhost:5000/api";

async function apiRequest(path, options={}) {
  const token = localStorage.getItem("hiretrack_token");
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? {Authorization:`Bearer ${token}`} : {}),
      ...(options.headers || {})
    }
  });
  return response.json();
}
