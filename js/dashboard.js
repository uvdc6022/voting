import { initSidebar } from "./sidebar.js";

// Canonical display order for known positions; anything unrecognized is
// appended at the end, alphabetically by label.
const POSITION_ORDER = [
  "president",
  "internal_vice_president",
  "external_vice_president",
  "secretary",
  "assistant_secretary",
  "treasurer",
  "assistant_treasurer",
  "auditor",
  "internal_pio",
  "external_pio",
];

const DEFAULT_PHOTO = "images/default-avatar.svg";

const session = initSidebar("dashboard.html");
const root = document.getElementById("dash-root");

if (session && root) {
  initResults();
}

async function initResults() {
  try {
    const [{ initializeApp }, dbModule, { firebaseConfig }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js"),
      import("./firebase-config.js"),
    ]);
    const { getDatabase, ref, get } = dbModule;

    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);

    const [candidatesSnap, usersSnap, votesSnap] = await Promise.all([
      get(ref(db, "candidates")),
      get(ref(db, "users")),
      get(ref(db, "votes")),
    ]);

    const candidates = candidatesSnap.val() || {};
    const users = usersSnap.val() || {};
    const votes = votesSnap.val() || {};
    const totalVoters = Object.values(users).filter((u) => Number(u?.role) !== 3).length;
    const voteCounts = countVotes(votes);

    const positions = groupCandidates(candidates, voteCounts);

    if (positions.length === 0) {
      renderEmptyState();
      return;
    }

    renderResults(positions, totalVoters);
  } catch (err) {
    console.error(err);
    renderError();
  }
}

function countVotes(votes) {
  const counts = {};
  for (const record of Object.values(votes)) {
    if (!record) continue;
    for (const [posKey, candidateKey] of Object.entries(record)) {
      if (posKey === "idNumber") continue;
      counts[candidateKey] = (counts[candidateKey] || 0) + 1;
    }
  }
  return counts;
}

function groupCandidates(candidates, voteCounts) {
  const byPosition = new Map();

  for (const key of Object.keys(candidates)) {
    const c = candidates[key];
    if (!c) continue;

    const posKey = c.position_key;
    if (!byPosition.has(posKey)) {
      byPosition.set(posKey, { key: posKey, label: c.position || posKey, candidates: [] });
    }
    byPosition.get(posKey).candidates.push({ key, ...c, votes: voteCounts[key] || 0 });
  }

  for (const group of byPosition.values()) {
    group.candidates.sort((a, b) => b.votes - a.votes);
  }

  return Array.from(byPosition.values()).sort((a, b) => {
    const ai = POSITION_ORDER.indexOf(a.key);
    const bi = POSITION_ORDER.indexOf(b.key);
    if (ai === -1 && bi === -1) return a.label.localeCompare(b.label);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function candidateName(c) {
  return `${c.firstname ?? ""} ${c.lastname ?? ""}`.trim();
}

function renderResults(positions, totalVoters) {
  const role = Number(session?.user?.role);

  root.innerHTML = `
    <div class="dash-results-header">
      <div>
        <h2>Live Results</h2>
        <p>Each candidate's progress bar is measured against ${totalVoters} registered voter${totalVoters === 1 ? "" : "s"}.</p>
      </div>
      ${
        role === 3
          ? `<button type="button" class="btn-primary dash-export-btn" id="export-dashboard-btn">
              <i data-lucide="download" class="icon"></i>
              <span>Export as Image</span>
            </button>`
          : ""
      }
    </div>
    <div class="dash-results-list" id="dash-export-target">
      ${positions.map((group) => positionResultHtml(group, totalVoters)).join("")}
    </div>
  `;

  hydrateCandidatePhotos(root);
  if (window.lucide) window.lucide.createIcons();

  document
    .getElementById("export-dashboard-btn")
    ?.addEventListener("click", (e) => exportDashboardAsImage(e.currentTarget));
}

// ---------- Export as image (role 3 only) ----------

async function loadHtml2Canvas() {
  if (window.html2canvas) return window.html2canvas;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load html2canvas"));
    document.head.appendChild(script);
  });
  return window.html2canvas;
}

async function exportDashboardAsImage(btn) {
  const target = document.getElementById("dash-export-target");
  if (!target) return;

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-circle" class="icon spin"></i><span>Exporting&hellip;</span>';
  if (window.lucide) window.lucide.createIcons();

  try {
    const html2canvas = await loadHtml2Canvas();
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#0a120e";

    await document.fonts.ready;
    const canvas = await html2canvas(target, { backgroundColor: bg, scale: 2, useCORS: true });

    const link = document.createElement("a");
    link.download = `dashboard-results-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();

    btn.innerHTML = '<i data-lucide="check" class="icon"></i><span>Exported!</span>';
  } catch (err) {
    console.error(err);
    btn.innerHTML = '<i data-lucide="circle-alert" class="icon"></i><span>Export failed</span>';
  }

  if (window.lucide) window.lucide.createIcons();
  btn.disabled = false;
  setTimeout(() => {
    btn.innerHTML = originalHtml;
    if (window.lucide) window.lucide.createIcons();
  }, 1500);
}

function positionResultHtml(group, totalVoters) {
  return `
    <section class="position-block">
      <div class="position-head">
        <h3>${escapeHtml(group.label)}</h3>
      </div>
      <div class="result-rows">
        ${group.candidates.map((c) => candidateResultHtml(c, totalVoters)).join("")}
      </div>
    </section>
  `;
}

function candidateResultHtml(c, totalVoters) {
  const name = escapeHtml(candidateName(c));
  const party = escapeHtml(c.partylist || "Independent");
  const votes = c.votes || 0;
  const pct = totalVoters > 0 ? Math.min(100, (votes / totalVoters) * 100) : 0;

  return `
    <div class="result-row">
      <span class="candidate-photo-wrap" data-party="${c.partylist_key || ""}">
        <img class="candidate-photo" data-key="${c.key}" src="images/${c.key}.png" alt="${name}" />
      </span>
      <div class="result-info">
        <div class="result-info-top">
          <strong class="candidate-name">${name}</strong>
          <span class="result-votes">${votes} vote${votes === 1 ? "" : "s"}</span>
        </div>
        <span class="candidate-party">${party}</span>
        <div class="result-progress-track">
          <div class="result-progress-fill" style="width:${pct}%"></div>
        </div>
      </div>
    </div>
  `;
}

function hydrateCandidatePhotos(scope) {
  scope.querySelectorAll("img.candidate-photo").forEach((img) => {
    img.addEventListener("error", () => {
      img.onerror = null;
      img.src = DEFAULT_PHOTO;
    });
  });
}

function renderEmptyState() {
  root.innerHTML = `
    <div class="ballot-loading">
      <div class="icon-wrap"><i data-lucide="layout-dashboard" class="icon"></i></div>
      <h2>No candidates yet</h2>
      <p>There are no candidates on file right now &mdash; check back soon.</p>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
}

function renderError() {
  root.innerHTML = `
    <div class="ballot-loading">
      <div class="icon-wrap"><i data-lucide="circle-alert" class="icon"></i></div>
      <h2>Couldn't load results</h2>
      <p>Something went wrong while loading the dashboard. Please check your connection and try again.</p>
      <button type="button" class="btn-primary retry-btn" id="retry-btn">
        <i data-lucide="refresh-cw" class="icon"></i>
        <span>Retry</span>
      </button>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
  document.getElementById("retry-btn")?.addEventListener("click", () => window.location.reload());
}
