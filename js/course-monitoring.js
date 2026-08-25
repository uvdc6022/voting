import { initSidebar } from "./sidebar.js";

const session = initSidebar("course-monitoring.html");
const root = document.getElementById("course-monitoring-root");

if (session && Number(session.user?.role) !== 3) {
  window.location.replace("dashboard.html");
} else if (session && root) {
  initCourseMonitoring();
}

async function initCourseMonitoring() {
  try {
    const [{ initializeApp }, dbModule, { firebaseConfig }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js"),
      import("./firebase-config.js"),
    ]);
    const { getDatabase, ref, onValue } = dbModule;

    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);

    let users = null;
    let votes = null;

    const renderIfReady = () => {
      if (users === null || votes === null) return;

      const groups = groupByCourseLevel(users, votes);

      if (groups.length === 0) {
        renderEmptyState();
        return;
      }

      renderGroups(groups);
    };

    const onError = (err) => {
      console.error(err);
      renderError();
    };

    onValue(ref(db, "users"), (snap) => { users = snap.val() || {}; renderIfReady(); }, onError);
    onValue(ref(db, "votes"), (snap) => { votes = snap.val() || {}; renderIfReady(); }, onError);
  } catch (err) {
    console.error(err);
    renderError();
  }
}

function groupByCourseLevel(users, votes) {
  const byGroup = new Map();

  for (const u of Object.values(users)) {
    if (!u || Number(u.role) === 3) continue;

    const course = u.course || "Unassigned";
    const level = u.level ?? "?";
    const key = `${course}-${level}`;

    if (!byGroup.has(key)) {
      byGroup.set(key, { key, course, level, label: `${course} ${level}`, total: 0, voted: 0 });
    }

    const group = byGroup.get(key);
    group.total += 1;
    if (votes[String(u.idNumber)]) group.voted += 1;
  }

  for (const group of byGroup.values()) {
    group.notVoted = group.total - group.voted;
    group.percentage = group.total > 0 ? Math.round((group.voted / group.total) * 1000) / 10 : 0;
  }

  return Array.from(byGroup.values()).sort((a, b) => {
    const courseCompare = String(a.course).localeCompare(String(b.course));
    if (courseCompare !== 0) return courseCompare;
    return Number(a.level) - Number(b.level);
  });
}

function renderGroups(groups) {
  const totalVoters = groups.reduce((sum, g) => sum + g.total, 0);
  const totalVoted = groups.reduce((sum, g) => sum + g.voted, 0);

  root.innerHTML = `
    <div class="dash-results-header">
      <div>
        <h2>Course Monitoring</h2>
        <p>Live voting status per course and year level &mdash; ${totalVoted} of ${totalVoters} registered voter${totalVoters === 1 ? "" : "s"} have voted.</p>
      </div>
    </div>
    <div class="course-cards-grid">
      ${groups.map(courseCardHtml).join("")}
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
}

function courseCardHtml(group) {
  const pct = Math.min(100, group.percentage);
  return `
    <div class="course-card">
      <div class="course-card-head">
        <h3>${escapeHtml(group.label)}</h3>
        <span class="course-card-pct">${group.percentage}%</span>
      </div>
      <div class="course-card-progress-track">
        <div class="course-card-progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="course-card-stats">
        <div class="course-card-stat">
          <span class="course-card-stat-value">${group.total}</span>
          <span class="course-card-stat-label">Total</span>
        </div>
        <div class="course-card-stat voted">
          <span class="course-card-stat-value">${group.voted}</span>
          <span class="course-card-stat-label">Voted</span>
        </div>
        <div class="course-card-stat pending">
          <span class="course-card-stat-value">${group.notVoted}</span>
          <span class="course-card-stat-label">Not Voted</span>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function renderEmptyState() {
  root.innerHTML = `
    <div class="ballot-loading">
      <div class="icon-wrap"><i data-lucide="graduation-cap" class="icon"></i></div>
      <h2>No users yet</h2>
      <p>There are no registered users on file right now &mdash; check back soon.</p>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
}

function renderError() {
  root.innerHTML = `
    <div class="ballot-loading">
      <div class="icon-wrap"><i data-lucide="circle-alert" class="icon"></i></div>
      <h2>Couldn't load course monitoring</h2>
      <p>Something went wrong while loading course monitoring. Please check your connection and try again.</p>
      <button type="button" class="btn-primary retry-btn" id="retry-btn">
        <i data-lucide="refresh-cw" class="icon"></i>
        <span>Retry</span>
      </button>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
  document.getElementById("retry-btn")?.addEventListener("click", () => window.location.reload());
}
