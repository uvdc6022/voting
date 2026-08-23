import { initSidebar } from "./sidebar.js";

const session = initSidebar("admins.html");
const root = document.getElementById("admins-root");

if (session && Number(session.user?.role) !== 3) {
  window.location.replace("dashboard.html");
} else if (session && root) {
  initAdminsPage();
}

async function initAdminsPage() {
  try {
    const [{ initializeApp }, dbModule, { firebaseConfig }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js"),
      import("./firebase-config.js"),
    ]);
    const { getDatabase, ref, get, update } = dbModule;

    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);

    const usersSnap = await get(ref(db, "users"));
    const usersVal = usersSnap.val() || {};

    const allAdmins = Object.keys(usersVal)
      .map((key) => {
        const u = usersVal[key] || {};
        return { ...u, idNumber: String(u.idNumber ?? key) };
      })
      .filter((u) => Number(u.role) === 2);

    renderPage({ db, ref, get, update, allAdmins });
  } catch (err) {
    console.error(err);
    renderError();
  }
}

// ---------- Shell ----------

function renderPage({ db, ref, get, update, allAdmins }) {
  root.innerHTML = `
    <div class="users-header">
      <div>
        <h2>Admins</h2>
        <p>Manage the users who can manage voters and monitor the election.</p>
      </div>
      <button type="button" class="btn-primary users-add-btn" id="add-admin-btn">
        <i data-lucide="user-plus" class="icon"></i>
        <span>Add Admin</span>
      </button>
    </div>

    <p class="users-match-text" id="admins-match-text"></p>

    <div class="users-table-wrap">
      <table class="users-table">
        <thead>
          <tr>
            <th>ID Number</th>
            <th>Name</th>
            <th>Course</th>
            <th>Year</th>
            <th>Gender</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="admins-tbody"></tbody>
      </table>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  document.getElementById("add-admin-btn").addEventListener("click", () => {
    openAddAdminModal({ db, ref, get, update, allAdmins, onAdded: () => renderTable(allAdmins, { db, ref, remove, allAdmins }) });
  });

  renderTable(allAdmins, { db, ref, update, allAdmins });
}

// ---------- Table ----------

function renderTable(allAdmins, ctx) {
  const sorted = [...allAdmins].sort((a, b) =>
    `${a.lastName ?? ""} ${a.firstName ?? ""}`.localeCompare(`${b.lastName ?? ""} ${b.firstName ?? ""}`)
  );

  const matchText = document.getElementById("admins-match-text");
  if (matchText) {
    matchText.textContent = `${sorted.length} admin${sorted.length === 1 ? "" : "s"}`;
  }

  const tbody = document.getElementById("admins-tbody");
  tbody.innerHTML =
    sorted.length === 0
      ? `<tr class="users-empty-row"><td colspan="6">No admins yet.</td></tr>`
      : sorted.map((u) => adminRowHtml(u)).join("");

  if (window.lucide) window.lucide.createIcons();

  tbody.querySelectorAll(".admins-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idNumber = btn.dataset.idnumber;
      const admin = allAdmins.find((u) => u.idNumber === idNumber);
      if (admin) openDeleteAdminModal({ ...ctx, admin, onRemoved: () => renderTable(allAdmins, ctx) });
    });
  });
}

function adminRowHtml(u) {
  const name = escapeHtml(`${u.firstName ?? ""} ${u.middleInitial ? u.middleInitial + " " : ""}${u.lastName ?? ""}`.trim());
  return `
    <tr>
      <td>${escapeHtml(u.idNumber)}</td>
      <td>${name}</td>
      <td>${escapeHtml(u.course ?? "")}</td>
      <td>${escapeHtml(u.level ?? "")}</td>
      <td>${escapeHtml(u.gender ?? "")}</td>
      <td>
        <div class="admins-row-actions">
          <button type="button" class="admins-delete-btn" data-idnumber="${escapeHtml(u.idNumber)}" aria-label="Delete admin">
            <i data-lucide="trash-2" class="icon"></i>
          </button>
        </div>
      </td>
    </tr>
  `;
}

// ---------- Add admin modal ----------

function openAddAdminModal({ db, ref, get, update, allAdmins, onAdded }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "add-admin-modal";
  overlay.innerHTML = `
    <div class="modal-card">
      <h3>Add Admin</h3>
      <p>Enter the ID number of an existing user to promote them to admin.</p>
      <div class="alert" id="add-admin-alert"></div>
      <form id="add-admin-form" novalidate>
        <div class="field">
          <label for="fa-idnumber">ID Number</label>
          <div class="input-wrap"><input type="text" id="fa-idnumber" inputmode="numeric" required /></div>
        </div>
      </form>
      <div class="modal-actions">
        <button type="button" class="btn-ghost" id="add-admin-cancel">
          <i data-lucide="x" class="icon"></i>
          <span>Cancel</span>
        </button>
        <button type="submit" form="add-admin-form" class="btn-primary" id="add-admin-submit">
          <i data-lucide="user-plus" class="icon"></i>
          <span>Add Admin</span>
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
  document.getElementById("add-admin-cancel").addEventListener("click", closeModal);

  const form = document.getElementById("add-admin-form");
  const alertBox = document.getElementById("add-admin-alert");
  const submitBtn = document.getElementById("add-admin-submit");

  const showError = (msg) => {
    alertBox.textContent = msg;
    alertBox.classList.add("show");
  };

  const resetSubmitBtn = () => {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i data-lucide="user-plus" class="icon"></i><span>Add Admin</span>';
    if (window.lucide) window.lucide.createIcons();
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertBox.classList.remove("show");

    const idNumber = document.getElementById("fa-idnumber").value.trim();

    if (!idNumber) {
      showError("Please enter an ID number.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i data-lucide="loader-circle" class="icon spin"></i><span>Adding&hellip;</span>';
    if (window.lucide) window.lucide.createIcons();

    try {
      const existingSnap = await get(ref(db, `users/${idNumber}`));
      if (!existingSnap.exists()) {
        showError("No user found with this ID number.");
        resetSubmitBtn();
        return;
      }

      const existing = existingSnap.val() || {};
      const currentRole = Number(existing.role);

      if (currentRole === 2) {
        showError("This user is already an admin.");
        resetSubmitBtn();
        return;
      }
      if (currentRole === 3) {
        showError("This user is a super admin and cannot be added as admin.");
        resetSubmitBtn();
        return;
      }

      await update(ref(db, `users/${idNumber}`), { role: 2 });

      allAdmins.push({ ...existing, idNumber: String(existing.idNumber ?? idNumber), role: 2 });
      closeModal();
      onAdded();
    } catch (err) {
      console.error(err);
      showError("Something went wrong while adding this admin. Please try again.");
      resetSubmitBtn();
    }
  });

  document.getElementById("fa-idnumber").focus();
}

// ---------- Remove admin modal ----------

function openDeleteAdminModal({ db, ref, update, allAdmins, admin, onRemoved }) {
  const name = `${admin.firstName ?? ""} ${admin.lastName ?? ""}`.trim() || admin.idNumber;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "delete-admin-modal";
  overlay.innerHTML = `
    <div class="modal-card">
      <h3>Remove Admin</h3>
      <p>Are you sure you want to remove admin access from <strong>${escapeHtml(name)}</strong> (ID ${escapeHtml(admin.idNumber)})? They will remain a user but will no longer be able to log in as an admin.</p>
      <div class="alert" id="delete-admin-alert"></div>
      <div class="modal-actions">
        <button type="button" class="btn-ghost" id="delete-admin-cancel">
          <i data-lucide="x" class="icon"></i>
          <span>Cancel</span>
        </button>
        <button type="button" class="btn-danger" id="delete-admin-confirm">
          <i data-lucide="trash-2" class="icon"></i>
          <span>Remove</span>
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
  document.getElementById("delete-admin-cancel").addEventListener("click", closeModal);

  const alertBox = document.getElementById("delete-admin-alert");
  const confirmBtn = document.getElementById("delete-admin-confirm");

  confirmBtn.addEventListener("click", async () => {
    alertBox.classList.remove("show");
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i data-lucide="loader-circle" class="icon spin"></i><span>Removing&hellip;</span>';
    if (window.lucide) window.lucide.createIcons();

    try {
      await update(ref(db, `users/${admin.idNumber}`), { role: 1 });

      const idx = allAdmins.findIndex((u) => u.idNumber === admin.idNumber);
      if (idx !== -1) allAdmins.splice(idx, 1);

      closeModal();
      onRemoved();
    } catch (err) {
      console.error(err);
      alertBox.textContent = "Something went wrong while removing this admin. Please try again.";
      alertBox.classList.add("show");
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = '<i data-lucide="trash-2" class="icon"></i><span>Remove</span>';
      if (window.lucide) window.lucide.createIcons();
    }
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
      <h2>Couldn't load admins</h2>
      <p>Something went wrong while loading the admin list. Please check your connection and try again.</p>
      <button type="button" class="btn-primary retry-btn" id="retry-btn">
        <i data-lucide="refresh-cw" class="icon"></i>
        <span>Retry</span>
      </button>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
  document.getElementById("retry-btn")?.addEventListener("click", () => window.location.reload());
}
