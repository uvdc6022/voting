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

const session = initSidebar("cast-vote.html");
const root = document.getElementById("ballot-root");

if (session && root) {
  initBallot(session.user);
}

async function initBallot(user) {
  const idNumber = String(user?.idNumber ?? "").trim();
  const role = Number(user?.role);

  try {
    const [{ initializeApp }, dbModule, { firebaseConfig }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js"),
      import("./firebase-config.js"),
    ]);
    const { getDatabase, ref, get, set, runTransaction } = dbModule;

    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);

    const votingOpenSnap = await get(ref(db, "settings/votingOpen"));
    const votingOpen = votingOpenSnap.val() === true;

    if (role === 3) {
      renderVotingControl({ db, ref, set, votingOpen });
      return;
    }

    if (!votingOpen) {
      renderVotingNotStarted();
      return;
    }

    const [voteSnap, candidatesSnap] = await Promise.all([
      get(ref(db, `votes/${idNumber}`)),
      get(ref(db, "candidates")),
    ]);

    const candidates = candidatesSnap.val() || {};

    if (voteSnap.exists()) {
      renderAlreadyVoted(voteSnap.val(), candidates);
      return;
    }

    const positions = groupActiveCandidates(candidates);

    if (positions.length === 0) {
      renderEmptyState();
      return;
    }

    renderBallot({ db, ref, runTransaction, idNumber, positions });
  } catch (err) {
    console.error(err);
    renderError();
  }
}

function groupActiveCandidates(candidates) {
  const byPosition = new Map();

  for (const key of Object.keys(candidates)) {
    const c = candidates[key];
    if (!c || c.active !== true) continue;

    const posKey = c.position_key;
    if (!byPosition.has(posKey)) {
      byPosition.set(posKey, { key: posKey, label: c.position || posKey, candidates: [] });
    }
    byPosition.get(posKey).candidates.push({ key, ...c });
  }

  for (const group of byPosition.values()) {
    group.candidates.sort((a, b) =>
      `${a.lastname} ${a.firstname}`.localeCompare(`${b.lastname} ${b.firstname}`)
    );
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

// ---------- Ballot form ----------

function renderBallot({ db, ref, runTransaction, idNumber, positions }) {
  const candidatesByKey = {};
  positions.forEach((group) => group.candidates.forEach((c) => (candidatesByKey[c.key] = c)));

  root.innerHTML = `
    <div class="ballot-header">
      <h2>Cast Your Vote</h2>
      <p>Select one candidate for each position below. Review your choices before submitting &mdash; you can only vote once.</p>
    </div>
    <form id="ballot-form" class="ballot-form" novalidate>
      ${positions.map(positionBlockHtml).join("")}
    </form>
    <div class="ballot-bar">
      <div class="ballot-progress">
        <div class="ballot-progress-track"><div class="ballot-progress-fill" id="progress-fill"></div></div>
        <span id="progress-text">0 of ${positions.length} positions selected</span>
      </div>
      <button type="submit" form="ballot-form" class="btn-primary ballot-submit" id="submit-ballot-btn" disabled>
        <i data-lucide="send" class="icon"></i>
        <span>Review &amp; Submit</span>
      </button>
    </div>

    <div class="modal-overlay" id="review-modal" hidden>
      <div class="modal-card">
        <h3>Review Your Ballot</h3>
        <p>Please double-check your selections. Once submitted, your vote cannot be changed.</p>
        <div class="alert" id="modal-alert"></div>
        <div class="review-list" id="review-list"></div>
        <div class="modal-actions">
          <button type="button" class="btn-ghost" id="modal-edit-btn">
            <i data-lucide="arrow-left" class="icon"></i>
            <span>Edit Selections</span>
          </button>
          <button type="button" class="btn-primary" id="modal-confirm-btn">
            <i data-lucide="check-check" class="icon"></i>
            <span>Confirm &amp; Submit</span>
          </button>
        </div>
      </div>
    </div>
  `;

  hydrateCandidatePhotos(root);
  if (window.lucide) window.lucide.createIcons();

  const form = document.getElementById("ballot-form");

  form.addEventListener("change", (e) => {
    if (e.target.matches(".candidate-radio")) updateProgress(form, positions);
  });
  updateProgress(form, positions);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const selections = collectSelections(form, positions);
    if (Object.keys(selections).length < positions.length) return;
    openReviewModal({ db, ref, runTransaction, idNumber, positions, candidatesByKey, selections, form });
  });
}

function positionBlockHtml(group) {
  return `
    <section class="position-block" id="position-${group.key}">
      <div class="position-head">
        <h3>${escapeHtml(group.label)}</h3>
        <span class="position-status" data-status-for="${group.key}">Not selected yet</span>
      </div>
      <div class="candidate-grid">
        ${group.candidates.map((c) => candidateCardHtml(group.key, c)).join("")}
      </div>
    </section>
  `;
}

function candidateCardHtml(posKey, c) {
  const name = escapeHtml(candidateName(c));
  const party = escapeHtml(c.partylist || "Independent");
  return `
    <label class="candidate-card">
      <input type="radio" name="${posKey}" value="${c.key}" class="candidate-radio" />
      <span class="candidate-photo-wrap" data-party="${c.partylist_key || ""}">
        <img class="candidate-photo" data-key="${c.key}" src="images/${c.key}.png" alt="${name}" />
      </span>
      <span class="candidate-info">
        <strong class="candidate-name">${name}</strong>
        <span class="candidate-party">${party}</span>
      </span>
      <span class="candidate-check"><i data-lucide="check" class="icon"></i></span>
    </label>
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

function collectSelections(form, positions) {
  const selections = {};
  positions.forEach((group) => {
    const checked = form.querySelector(`input[name="${group.key}"]:checked`);
    if (checked) selections[group.key] = checked.value;
  });
  return selections;
}

function updateProgress(form, positions) {
  let selectedCount = 0;

  positions.forEach((group) => {
    const checked = form.querySelector(`input[name="${group.key}"]:checked`);
    const statusEl = form.querySelector(`[data-status-for="${group.key}"]`);
    const blockEl = document.getElementById(`position-${group.key}`);

    if (checked) {
      selectedCount++;
      const candidate = group.candidates.find((c) => c.key === checked.value);
      if (statusEl) statusEl.textContent = candidate ? `Selected: ${candidateName(candidate)}` : "Selected";
      blockEl?.classList.add("completed");
    } else {
      if (statusEl) statusEl.textContent = "Not selected yet";
      blockEl?.classList.remove("completed");
    }
  });

  const total = positions.length;
  const progressText = document.getElementById("progress-text");
  const progressFill = document.getElementById("progress-fill");
  const submitBtn = document.getElementById("submit-ballot-btn");

  if (progressText) progressText.textContent = `${selectedCount} of ${total} positions selected`;
  if (progressFill) progressFill.style.width = `${(selectedCount / total) * 100}%`;
  if (submitBtn) submitBtn.disabled = selectedCount < total;

  return selectedCount;
}

// ---------- Review modal + submission ----------

function openReviewModal(ctx) {
  const { positions, candidatesByKey, selections } = ctx;
  const modal = document.getElementById("review-modal");
  const list = document.getElementById("review-list");
  const alertBox = document.getElementById("modal-alert");
  const confirmBtn = document.getElementById("modal-confirm-btn");
  const editBtn = document.getElementById("modal-edit-btn");

  alertBox.classList.remove("show");
  alertBox.textContent = "";

  list.innerHTML = positions
    .map((group) => {
      const candidate = candidatesByKey[selections[group.key]];
      return `
        <div class="review-row">
          <span class="review-position">${escapeHtml(group.label)}</span>
          <span class="review-candidate">
            <strong>${escapeHtml(candidate ? candidateName(candidate) : "")}</strong>
            <span>${escapeHtml(candidate?.partylist || "Independent")}</span>
          </span>
        </div>
      `;
    })
    .join("");

  const closeModal = () => {
    modal.setAttribute("hidden", "");
    document.removeEventListener("keydown", onKeydown);
  };
  const onKeydown = (e) => {
    if (e.key === "Escape") closeModal();
  };

  editBtn.onclick = closeModal;
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
  document.addEventListener("keydown", onKeydown);

  confirmBtn.onclick = async () => {
    confirmBtn.disabled = true;
    editBtn.disabled = true;
    confirmBtn.innerHTML = '<i data-lucide="loader-circle" class="icon spin"></i><span>Submitting&hellip;</span>';
    if (window.lucide) window.lucide.createIcons();

    try {
      await submitVote(ctx);
      document.removeEventListener("keydown", onKeydown);
      renderAlreadyVoted({ idNumber: ctx.idNumber, ...selections }, candidatesByKey);
    } catch (err) {
      console.error(err);
      confirmBtn.disabled = false;
      editBtn.disabled = false;
      confirmBtn.innerHTML = '<i data-lucide="check-check" class="icon"></i><span>Confirm &amp; Submit</span>';
      if (window.lucide) window.lucide.createIcons();

      alertBox.textContent =
        err?.message === "ALREADY_VOTED"
          ? "It looks like a vote was already recorded for your account. Refreshing your status&hellip;"
          : "Something went wrong while submitting your vote. Please try again.";
      alertBox.classList.add("show");

      if (err?.message === "ALREADY_VOTED") {
        setTimeout(() => window.location.reload(), 1800);
      }
    }
  };

  modal.removeAttribute("hidden");
}

async function submitVote({ db, ref, runTransaction, idNumber, selections }) {
  const voteRef = ref(db, `votes/${idNumber}`);
  const payload = { idNumber, ...selections };

  const result = await runTransaction(voteRef, (current) => {
    if (current !== null) return; // abort — a vote already exists
    return payload;
  });

  if (!result.committed) {
    throw new Error("ALREADY_VOTED");
  }
}

// ---------- Voting control (role 3) ----------

function renderVotingControl({ db, ref, set, votingOpen }) {
  root.innerHTML = `
    <div class="ballot-header">
      <h2>Voting Control</h2>
      <p>Start voting to let students view candidates and submit their ballots, or stop it to close the polls.</p>
    </div>
    <div class="voting-control-card">
      <span class="status-badge ${votingOpen ? "voted" : "pending"}">
        <i data-lucide="${votingOpen ? "circle-check-big" : "circle-pause"}" class="icon"></i>
        <span>Voting is ${votingOpen ? "open" : "closed"}</span>
      </span>
      <p>${
        votingOpen
          ? "Students can currently view candidates and submit their ballots."
          : "Students see a notice that voting hasn't started yet."
      }</p>
      <button type="button" class="${votingOpen ? "btn-danger" : "btn-primary"}" id="voting-toggle-btn">
        <i data-lucide="${votingOpen ? "square" : "play"}" class="icon"></i>
        <span>${votingOpen ? "Stop Voting" : "Start Voting"}</span>
      </button>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const btn = document.getElementById("voting-toggle-btn");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const next = !votingOpen;
    try {
      await set(ref(db, "settings/votingOpen"), next);
      renderVotingControl({ db, ref, set, votingOpen: next });
    } catch (err) {
      console.error(err);
      btn.disabled = false;
    }
  });
}

function renderVotingNotStarted() {
  root.innerHTML = `
    <div class="ballot-loading">
      <div class="icon-wrap"><i data-lucide="hourglass" class="icon"></i></div>
      <h2>Voting hasn't started yet</h2>
      <p>The election committee hasn't opened the polls yet. Please check back soon.</p>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
}

// ---------- Static states ----------

function renderAlreadyVoted(voteRecord, candidatesByKey) {
  const rows = Object.keys(voteRecord)
    .filter((k) => k !== "idNumber")
    .map((posKey) => {
      const candidate = candidatesByKey[voteRecord[posKey]];
      return {
        label: candidate?.position || posKey,
        name: candidate ? candidateName(candidate) : voteRecord[posKey],
        party: candidate?.partylist || "Independent",
      };
    });

  root.innerHTML = `
    <div class="ballot-done">
      <div class="icon-wrap done"><i data-lucide="circle-check-big" class="icon"></i></div>
      <h2>You've Already Voted</h2>
      <p>Thank you for participating in the UV Dalaguete Campus election. Your ballot has been recorded and can't be changed.</p>
      <div class="review-list receipt">
        ${rows
          .map(
            (r) => `
          <div class="review-row">
            <span class="review-position">${escapeHtml(r.label)}</span>
            <span class="review-candidate">
              <strong>${escapeHtml(r.name)}</strong>
              <span>${escapeHtml(r.party)}</span>
            </span>
          </div>`
          )
          .join("")}
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
}

function renderEmptyState() {
  root.innerHTML = `
    <div class="ballot-loading">
      <div class="icon-wrap"><i data-lucide="vote" class="icon"></i></div>
      <h2>Voting isn't open yet</h2>
      <p>There are no active candidates on the ballot right now &mdash; check back soon.</p>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
}

function renderError() {
  root.innerHTML = `
    <div class="ballot-loading">
      <div class="icon-wrap"><i data-lucide="circle-alert" class="icon"></i></div>
      <h2>Couldn't load the ballot</h2>
      <p>Something went wrong while loading candidates. Please check your connection and try again.</p>
      <button type="button" class="btn-primary retry-btn" id="retry-btn">
        <i data-lucide="refresh-cw" class="icon"></i>
        <span>Retry</span>
      </button>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
  document.getElementById("retry-btn")?.addEventListener("click", () => window.location.reload());
}
