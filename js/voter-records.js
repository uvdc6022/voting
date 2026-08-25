import { initSidebar } from "./sidebar.js";

const PAGE_SIZE = 50;

// Canonical display order for known positions; anything unrecognized is
// appended at the end, alphabetically by label. Kept in sync with the copies
// in cast-vote.js, dashboard.js, and final-results.js.
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

const session = initSidebar("voter-records.html");
const root = document.getElementById("voter-records-root");

if (session && Number(session.user?.role) !== 3) {
  window.location.replace("dashboard.html");
} else if (session && root) {
  initVoterRecordsPage();
}

async function initVoterRecordsPage() {
  try {
    const [{ initializeApp }, dbModule, { firebaseConfig }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js"),
      import("./firebase-config.js"),
    ]);
    const { getDatabase, ref, get } = dbModule;

    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);

    const [usersSnap, votesSnap, candidatesSnap] = await Promise.all([
      get(ref(db, "users")),
      get(ref(db, "votes")),
      get(ref(db, "candidates")),
    ]);

    const usersVal = usersSnap.val() || {};
    const votesVal = votesSnap.val() || {};
    const candidates = candidatesSnap.val() || {};

    const candidatesByKey = {};
    for (const key of Object.keys(candidates)) {
      candidatesByKey[key] = { key, ...candidates[key] };
    }

    const allUsers = Object.keys(usersVal)
      .map((key) => {
        const u = usersVal[key] || {};
        const idNumber = String(u.idNumber ?? key);
        const voteRecord = votesVal[idNumber] || null;
        return { ...u, idNumber, voted: voteRecord !== null, voteRecord };
      })
      .filter((u) => Number(u.role) !== 3);

    renderPage({ allUsers, candidatesByKey });
  } catch (err) {
    console.error(err);
    renderError();
  }
}

// ---------- Shell + filters ----------

function renderPage({ allUsers, candidatesByKey }) {
  const courses = Array.from(new Set(allUsers.map((u) => u.course).filter(Boolean))).sort();
  const levels = Array.from(
    new Set(allUsers.map((u) => u.level).filter((l) => l !== undefined && l !== null))
  ).sort((a, b) => Number(a) - Number(b));

  const state = { course: "", level: "", status: "", search: "", page: 1 };

  root.innerHTML = `
    <div class="users-header">
      <div>
        <h2>Voter Records</h2>
        <p>Search a voter to see exactly who they selected for each position.</p>
      </div>
    </div>

    <div class="users-stats" id="voter-records-stats"></div>

    <div class="users-filters">
      <div class="input-wrap users-search-wrap">
        <span class="icon-leading"><i data-lucide="search" class="icon"></i></span>
        <input type="text" id="filter-search" placeholder="Search by name or ID number" />
      </div>
      <select class="users-select" id="filter-course">
        <option value="">All Courses</option>
        ${courses.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
      </select>
      <select class="users-select" id="filter-level">
        <option value="">All Years</option>
        ${levels.map((l) => `<option value="${escapeHtml(l)}">Year ${escapeHtml(l)}</option>`).join("")}
      </select>
      <select class="users-select" id="filter-status">
        <option value="">All Status</option>
        <option value="voted">Voted</option>
        <option value="not-voted">Not Voted</option>
      </select>
    </div>

    <p class="users-match-text" id="voter-records-match-text"></p>

    <div class="users-table-wrap">
      <table class="users-table">
        <thead>
          <tr>
            <th>ID Number</th>
            <th>Name</th>
            <th>Course</th>
            <th>Year</th>
            <th>Gender</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="voter-records-tbody"></tbody>
      </table>
    </div>

    <div class="users-pagination" id="voter-records-pagination"></div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const searchInput = document.getElementById("filter-search");
  const courseSelect = document.getElementById("filter-course");
  const levelSelect = document.getElementById("filter-level");
  const statusSelect = document.getElementById("filter-status");

  let searchDebounce;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.search = searchInput.value.trim().toLowerCase();
      state.page = 1;
      renderTable(allUsers, state, candidatesByKey);
    }, 200);
  });
  courseSelect.addEventListener("change", () => {
    state.course = courseSelect.value;
    state.page = 1;
    renderTable(allUsers, state, candidatesByKey);
  });
  levelSelect.addEventListener("change", () => {
    state.level = levelSelect.value;
    state.page = 1;
    renderTable(allUsers, state, candidatesByKey);
  });
  statusSelect.addEventListener("change", () => {
    state.status = statusSelect.value;
    state.page = 1;
    renderTable(allUsers, state, candidatesByKey);
  });

  renderTable(allUsers, state, candidatesByKey);
}

function renderStats(users) {
  const total = users.length;
  const voted = users.filter((u) => u.voted).length;
  const notVoted = total - voted;

  const statsEl = document.getElementById("voter-records-stats");
  statsEl.innerHTML = `
    <div class="users-stat-card">
      <span class="users-stat-value">${total}</span>
      <span class="users-stat-label">Total Users</span>
    </div>
    <div class="users-stat-card voted">
      <span class="users-stat-value">${voted}</span>
      <span class="users-stat-label">Voted</span>
    </div>
    <div class="users-stat-card pending">
      <span class="users-stat-value">${notVoted}</span>
      <span class="users-stat-label">Not Voted</span>
    </div>
  `;
}

// ---------- Filtering + table ----------

function filterUsers(allUsers, state) {
  return allUsers.filter((u) => {
    if (state.course && u.course !== state.course) return false;
    if (state.level && String(u.level) !== state.level) return false;
    if (state.status === "voted" && !u.voted) return false;
    if (state.status === "not-voted" && u.voted) return false;
    if (state.search) {
      const fullName = `${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase();
      const idNumber = String(u.idNumber ?? "").toLowerCase();
      if (!fullName.includes(state.search) && !idNumber.includes(state.search)) return false;
    }
    return true;
  });
}

function renderTable(allUsers, state, candidatesByKey) {
  const filtered = filterUsers(allUsers, state).sort((a, b) =>
    `${a.lastName ?? ""} ${a.firstName ?? ""}`.localeCompare(`${b.lastName ?? ""} ${b.firstName ?? ""}`)
  );

  renderStats(filtered);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), totalPages);

  const start = (state.page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  const matchText = document.getElementById("voter-records-match-text");
  if (matchText) {
    matchText.textContent = `Showing ${filtered.length === 0 ? 0 : start + 1}-${Math.min(
      start + PAGE_SIZE,
      filtered.length
    )} of ${filtered.length} users`;
  }

  const tbody = document.getElementById("voter-records-tbody");
  tbody.innerHTML =
    pageItems.length === 0
      ? `<tr class="users-empty-row"><td colspan="6">No users match these filters.</td></tr>`
      : pageItems.map(userRowHtml).join("");
  if (window.lucide) window.lucide.createIcons();

  tbody.querySelectorAll("tr.clickable-row").forEach((row) => {
    row.addEventListener("click", () => {
      const u = pageItems.find((item) => item.idNumber === row.dataset.idnumber);
      if (u) openVoteRecordModal(u, candidatesByKey);
    });
  });

  renderPagination(state, totalPages, () => renderTable(allUsers, state, candidatesByKey));
}

function userRowHtml(u) {
  const name = escapeHtml(`${u.firstName ?? ""} ${u.middleInitial ? u.middleInitial + " " : ""}${u.lastName ?? ""}`.trim());
  return `
    <tr class="clickable-row" data-idnumber="${escapeHtml(u.idNumber)}">
      <td>${escapeHtml(u.idNumber)}</td>
      <td>${name}</td>
      <td>${escapeHtml(u.course ?? "")}</td>
      <td>${escapeHtml(u.level ?? "")}</td>
      <td>${escapeHtml(u.gender ?? "")}</td>
      <td>
        <span class="status-badge ${u.voted ? "voted" : "pending"}">
          <i data-lucide="${u.voted ? "circle-check" : "circle-dashed"}" class="icon"></i>
          <span>${u.voted ? "Voted" : "Not Voted"}</span>
        </span>
      </td>
    </tr>
  `;
}

function renderPagination(state, totalPages, onChange) {
  const el = document.getElementById("voter-records-pagination");
  if (!el) return;

  if (totalPages <= 1) {
    el.innerHTML = "";
    return;
  }

  el.innerHTML = `
    <button type="button" class="btn-ghost" id="page-prev" ${state.page <= 1 ? "disabled" : ""}>
      <i data-lucide="chevron-left" class="icon"></i>
      <span>Prev</span>
    </button>
    <span class="users-page-text">Page ${state.page} of ${totalPages}</span>
    <button type="button" class="btn-ghost" id="page-next" ${state.page >= totalPages ? "disabled" : ""}>
      <span>Next</span>
      <i data-lucide="chevron-right" class="icon"></i>
    </button>
  `;
  if (window.lucide) window.lucide.createIcons();

  document.getElementById("page-prev")?.addEventListener("click", () => {
    state.page -= 1;
    onChange();
    root?.scrollIntoView({ block: "start" });
  });
  document.getElementById("page-next")?.addEventListener("click", () => {
    state.page += 1;
    onChange();
    root?.scrollIntoView({ block: "start" });
  });
}

// ---------- Vote record modal ----------

function candidateName(c) {
  return `${c.firstname ?? ""} ${c.lastname ?? ""}`.trim();
}

function openVoteRecordModal(user, candidatesByKey) {
  const name = `${user.firstName ?? ""} ${user.middleInitial ? user.middleInitial + ". " : ""}${user.lastName ?? ""}`
    .replace(/\s+/g, " ")
    .trim();

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "vote-record-modal";
  overlay.innerHTML = `
    <div class="modal-card">
      <h3>${escapeHtml(name || user.idNumber)}</h3>
      <p>ID ${escapeHtml(user.idNumber)} &middot; ${escapeHtml(user.course ?? "")} - Year ${escapeHtml(user.level ?? "")}</p>
      <div class="review-list" id="vote-record-list"></div>
      <div class="modal-actions">
        <button type="button" class="btn-ghost" id="vote-record-close">
          <i data-lucide="x" class="icon"></i>
          <span>Close</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const list = document.getElementById("vote-record-list");
  list.innerHTML = voteRecordListHtml(user.voteRecord, candidatesByKey);
  hydrateVoteRecordPhotos(list);

  if (window.lucide) window.lucide.createIcons();

  const closeModal = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKeydown);
  };
  const onKeydown = (e) => {
    if (e.key === "Escape") closeModal();
  };
  document.addEventListener("keydown", onKeydown);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });
  document.getElementById("vote-record-close").addEventListener("click", closeModal);
}

function voteRecordListHtml(voteRecord, candidatesByKey) {
  if (!voteRecord) {
    return `<p class="vote-record-empty">This user hasn't cast a vote yet.</p>`;
  }

  const posKeys = Object.keys(voteRecord)
    .filter((k) => k !== "idNumber")
    .sort((a, b) => {
      const ai = POSITION_ORDER.indexOf(a);
      const bi = POSITION_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

  return posKeys.map((posKey) => voteRecordRowHtml(posKey, candidatesByKey[voteRecord[posKey]])).join("");
}

function voteRecordRowHtml(posKey, candidate) {
  const label = candidate?.position || posKey;
  const name = candidate ? candidateName(candidate) : "Unknown candidate";
  const party = candidate?.partylist || "Independent";
  const photoSrc = candidate ? `images/${candidate.key}.png` : DEFAULT_PHOTO;

  return `
    <div class="vote-record-row">
      <span class="vote-record-photo-wrap" data-party="${candidate?.partylist_key || ""}">
        <img class="candidate-photo vote-record-photo" data-key="${candidate?.key || ""}" src="${photoSrc}" alt="${escapeHtml(name)}" />
      </span>
      <div class="vote-record-info">
        <span class="vote-record-position">${escapeHtml(label)}</span>
        <strong class="vote-record-name">${escapeHtml(name)}</strong>
        <span class="vote-record-party">${escapeHtml(party)}</span>
      </div>
    </div>
  `;
}

function hydrateVoteRecordPhotos(scope) {
  scope.querySelectorAll("img.vote-record-photo").forEach((img) => {
    img.addEventListener("error", () => {
      img.onerror = null;
      img.src = DEFAULT_PHOTO;
    });
  });
}

// ---------- Helpers ----------

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function renderError() {
  root.innerHTML = `
    <div class="ballot-loading">
      <div class="icon-wrap"><i data-lucide="circle-alert" class="icon"></i></div>
      <h2>Couldn't load voter records</h2>
      <p>Something went wrong while loading voter records. Please check your connection and try again.</p>
      <button type="button" class="btn-primary retry-btn" id="retry-btn">
        <i data-lucide="refresh-cw" class="icon"></i>
        <span>Retry</span>
      </button>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
  document.getElementById("retry-btn")?.addEventListener("click", () => window.location.reload());
}
