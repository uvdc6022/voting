import { initSidebar } from "./sidebar.js";

const PAGE_SIZE = 50;

const session = initSidebar("users.html");
const root = document.getElementById("users-root");

if (session && root) {
  initUsersPage(session.user);
}

async function initUsersPage(currentUser) {
  const canAddUser = Number(currentUser?.role) === 3;

  try {
    const [{ initializeApp }, dbModule, { firebaseConfig }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js"),
      import("./firebase-config.js"),
    ]);
    const { getDatabase, ref, get, set } = dbModule;

    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);

    const [usersSnap, votesSnap] = await Promise.all([
      get(ref(db, "users")),
      get(ref(db, "votes")),
    ]);

    const usersVal = usersSnap.val() || {};
    const votedIds = new Set(Object.keys(votesSnap.val() || {}));

    const allUsers = Object.keys(usersVal).map((key) => {
      const u = usersVal[key] || {};
      return { ...u, idNumber: String(u.idNumber ?? key), voted: votedIds.has(String(u.idNumber ?? key)) };
    });

    renderPage({ db, ref, get, set, allUsers, canAddUser });
  } catch (err) {
    console.error(err);
    renderError();
  }
}

// ---------- Shell + filters ----------

function renderPage({ db, ref, get, set, allUsers, canAddUser }) {
  const visibleUsers = allUsers.filter((u) => Number(u.role) !== 3);
  const courses = Array.from(new Set(visibleUsers.map((u) => u.course).filter(Boolean))).sort();
  const levels = Array.from(
    new Set(visibleUsers.map((u) => u.level).filter((l) => l !== undefined && l !== null))
  ).sort((a, b) => Number(a) - Number(b));

  const state = { course: "", level: "", status: "", search: "", page: 1 };

  root.innerHTML = `
    <div class="users-header">
      <div>
        <h2>Users</h2>
        <p>Track who has voted so far, filterable by course and year level.</p>
      </div>
      ${
        canAddUser
          ? `<button type="button" class="btn-primary users-add-btn" id="add-user-btn">
              <i data-lucide="user-plus" class="icon"></i>
              <span>Add User</span>
            </button>`
          : ""
      }
    </div>

    <div class="users-stats" id="users-stats"></div>

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

    <p class="users-match-text" id="users-match-text"></p>

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
        <tbody id="users-tbody"></tbody>
      </table>
    </div>

    <div class="users-pagination" id="users-pagination"></div>
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
      renderTable(allUsers, state);
    }, 200);
  });
  courseSelect.addEventListener("change", () => {
    state.course = courseSelect.value;
    state.page = 1;
    renderTable(allUsers, state);
  });
  levelSelect.addEventListener("change", () => {
    state.level = levelSelect.value;
    state.page = 1;
    renderTable(allUsers, state);
  });
  statusSelect.addEventListener("change", () => {
    state.status = statusSelect.value;
    state.page = 1;
    renderTable(allUsers, state);
  });

  document.getElementById("add-user-btn")?.addEventListener("click", () => {
    openAddUserModal({ db, ref, get, set, allUsers, onAdded: () => renderTable(allUsers, state) });
  });

  renderTable(allUsers, state);
}

function renderStats(users) {
  const total = users.length;
  const voted = users.filter((u) => u.voted).length;
  const notVoted = total - voted;

  const statsEl = document.getElementById("users-stats");
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
    if (Number(u.role) === 3) return false;
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

function renderTable(allUsers, state) {
  const filtered = filterUsers(allUsers, state).sort((a, b) =>
    `${a.lastName ?? ""} ${a.firstName ?? ""}`.localeCompare(`${b.lastName ?? ""} ${b.firstName ?? ""}`)
  );

  renderStats(filtered);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), totalPages);

  const start = (state.page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  const matchText = document.getElementById("users-match-text");
  if (matchText) {
    matchText.textContent = `Showing ${filtered.length === 0 ? 0 : start + 1}-${Math.min(
      start + PAGE_SIZE,
      filtered.length
    )} of ${filtered.length} users`;
  }

  const tbody = document.getElementById("users-tbody");
  tbody.innerHTML =
    pageItems.length === 0
      ? `<tr class="users-empty-row"><td colspan="6">No users match these filters.</td></tr>`
      : pageItems.map(userRowHtml).join("");

  renderPagination(state, totalPages, () => renderTable(allUsers, state));
}

function userRowHtml(u) {
  const name = escapeHtml(`${u.firstName ?? ""} ${u.middleInitial ? u.middleInitial + " " : ""}${u.lastName ?? ""}`.trim());
  return `
    <tr>
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
  const el = document.getElementById("users-pagination");
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

// ---------- Add user modal (role 3 only) ----------

function openAddUserModal({ db, ref, get, set, allUsers, onAdded }) {
  const courses = Array.from(
    new Set(allUsers.filter((u) => Number(u.role) !== 3).map((u) => u.course).filter(Boolean))
  ).sort();

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "add-user-modal";
  overlay.innerHTML = `
    <div class="modal-card">
      <h3>Add User</h3>
      <p>Register a new user so they can log in and vote.</p>
      <div class="alert" id="add-user-alert"></div>
      <form id="add-user-form" novalidate>
        <div class="field">
          <label for="f-idnumber">ID Number</label>
          <div class="input-wrap"><input type="text" id="f-idnumber" inputmode="numeric" required /></div>
        </div>
        <div class="field">
          <label for="f-lastname">Last Name</label>
          <div class="input-wrap"><input type="text" id="f-lastname" required /></div>
        </div>
        <div class="field">
          <label for="f-firstname">First Name</label>
          <div class="input-wrap"><input type="text" id="f-firstname" required /></div>
        </div>
        <div class="field">
          <label for="f-mi">Middle Initial</label>
          <div class="input-wrap"><input type="text" id="f-mi" maxlength="4" /></div>
        </div>
        <div class="field">
          <label for="f-course">Course</label>
          <div class="input-wrap">
            <input type="text" id="f-course" list="course-options" required />
          </div>
          <datalist id="course-options">
            ${courses.map((c) => `<option value="${escapeHtml(c)}"></option>`).join("")}
          </datalist>
        </div>
        <div class="field">
          <label for="f-level">Year Level</label>
          <div class="input-wrap">
            <select id="f-level" required>
              <option value="">Select year</option>
              <option value="1">Year 1</option>
              <option value="2">Year 2</option>
              <option value="3">Year 3</option>
              <option value="4">Year 4</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label for="f-gender">Gender</label>
          <div class="input-wrap">
            <select id="f-gender" required>
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label for="f-role">Role</label>
          <div class="input-wrap">
            <select id="f-role" required>
              <option value="1" selected>Voter</option>
              <option value="2">Admin</option>
              <option value="3">Super Admin</option>
            </select>
          </div>
        </div>
      </form>
      <div class="modal-actions">
        <button type="button" class="btn-ghost" id="add-user-cancel">
          <i data-lucide="x" class="icon"></i>
          <span>Cancel</span>
        </button>
        <button type="submit" form="add-user-form" class="btn-primary" id="add-user-submit">
          <i data-lucide="user-plus" class="icon"></i>
          <span>Add User</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
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
  document.getElementById("add-user-cancel").addEventListener("click", closeModal);

  const form = document.getElementById("add-user-form");
  const alertBox = document.getElementById("add-user-alert");
  const submitBtn = document.getElementById("add-user-submit");

  const showError = (msg) => {
    alertBox.textContent = msg;
    alertBox.classList.add("show");
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertBox.classList.remove("show");

    const idNumber = document.getElementById("f-idnumber").value.trim();
    const lastName = document.getElementById("f-lastname").value.trim().toUpperCase();
    const firstName = document.getElementById("f-firstname").value.trim().toUpperCase();
    const middleInitial = document.getElementById("f-mi").value.trim().toUpperCase();
    const course = document.getElementById("f-course").value.trim().toUpperCase();
    const level = document.getElementById("f-level").value;
    const gender = document.getElementById("f-gender").value;
    const role = document.getElementById("f-role").value;

    if (!idNumber || !lastName || !firstName || !course || !level || !gender || !role) {
      showError("Please fill in all required fields.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i data-lucide="loader-circle" class="icon spin"></i><span>Adding&hellip;</span>';
    if (window.lucide) window.lucide.createIcons();

    try {
      const existingSnap = await get(ref(db, `users/${idNumber}`));
      if (existingSnap.exists()) {
        showError("A user with this ID number already exists.");
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i data-lucide="user-plus" class="icon"></i><span>Add User</span>';
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      const payload = {
        idNumber,
        lastName,
        firstName,
        middleInitial,
        course,
        level: Number(level),
        gender,
        role: Number(role),
      };

      await set(ref(db, `users/${idNumber}`), payload);

      allUsers.push({ ...payload, voted: false });
      closeModal();
      onAdded();
    } catch (err) {
      console.error(err);
      showError("Something went wrong while adding this user. Please try again.");
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-lucide="user-plus" class="icon"></i><span>Add User</span>';
      if (window.lucide) window.lucide.createIcons();
    }
  });

  document.getElementById("f-idnumber").focus();
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
      <h2>Couldn't load users</h2>
      <p>Something went wrong while loading the user list. Please check your connection and try again.</p>
      <button type="button" class="btn-primary retry-btn" id="retry-btn">
        <i data-lucide="refresh-cw" class="icon"></i>
        <span>Retry</span>
      </button>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
  document.getElementById("retry-btn")?.addEventListener("click", () => window.location.reload());
}
