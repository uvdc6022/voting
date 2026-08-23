// Shared localStorage session helpers used by both the login page and dashboard.
const SESSION_KEY = "uvdc_session";

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(user) {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ user, loginTime: Date.now() })
  );
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// Role 1 (voter) lands on the ballot; every other role lands on the dashboard.
export function landingPageFor(user) {
  return Number(user?.role) === 1 ? "cast-vote.html" : "dashboard.html";
}
