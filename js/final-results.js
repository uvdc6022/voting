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

const session = initSidebar("final-results.html");
const root = document.getElementById("winners-root");

if (session && root) {
  initFinalResults();
}

async function initFinalResults() {
  try {
    const [{ initializeApp }, dbModule, { firebaseConfig }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js"),
      import("./firebase-config.js"),
    ]);
    const { getDatabase, ref, get } = dbModule;

    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);

    const [candidatesSnap, votesSnap] = await Promise.all([
      get(ref(db, "candidates")),
      get(ref(db, "votes")),
    ]);

    const candidates = candidatesSnap.val() || {};
    const voteCounts = countVotes(votesSnap.val() || {});
    const positions = groupCandidates(candidates, voteCounts);

    if (positions.length === 0) {
      renderEmptyState();
      return;
    }

    renderWinners(positions);
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

// A position's winner is whichever candidate(s) have the most votes. When
// more than one candidate shares that top count, there's no single winner.
function topCandidates(group) {
  const top = Math.max(...group.candidates.map((c) => c.votes));
  return group.candidates.filter((c) => c.votes === top);
}

function renderWinners(positions) {
  root.innerHTML = `
    <div class="winners-header">
      <h2>Final Results</h2>
      <p>The leading candidate for each position, based on votes cast.</p>
    </div>
    <div class="winner-grid">
      ${positions.map(winnerCardHtml).join("")}
    </div>
  `;

  hydrateWinnerPhotos(root);
  if (window.lucide) window.lucide.createIcons();
}

function winnerCardHtml(group) {
  const winners = topCandidates(group);
  return winners.length > 1 ? tiedCardHtml(group, winners) : singleWinnerCardHtml(group, winners[0]);
}

function singleWinnerCardHtml(group, winner) {
  const name = escapeHtml(candidateName(winner));
  const party = escapeHtml(winner.partylist || "Independent");
  const votes = winner.votes;

  return `
    <div class="winner-card">
      <span class="winner-position">${escapeHtml(group.label)}</span>
      <span class="winner-photo-wrap">
        <img class="winner-photo" data-key="${winner.key}" data-party="${winner.partylist_key || ""}" src="images/${winner.key}.png" alt="${name}" />
        <span class="winner-crown"><i data-lucide="crown" class="icon"></i></span>
      </span>
      <strong class="winner-name">${name}</strong>
      <span class="winner-party">${party}</span>
      <span class="winner-votes">${votes} vote${votes === 1 ? "" : "s"}</span>
    </div>
  `;
}

function tiedCardHtml(group, winners) {
  const names = winners.map((c) => candidateName(c));
  const namesText = escapeHtml(
    new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(names)
  );
  const votes = winners[0].votes;

  return `
    <div class="winner-card tied">
      <span class="winner-position">${escapeHtml(group.label)}</span>
      <span class="winner-photo-wrap">
        <img class="winner-photo" src="${DEFAULT_PHOTO}" alt="Tied result" />
      </span>
      <strong class="winner-name">Tied</strong>
      <span class="winner-party">${namesText}</span>
      <span class="winner-votes">${votes} vote${votes === 1 ? "" : "s"} each</span>
    </div>
  `;
}

function hydrateWinnerPhotos(scope) {
  scope.querySelectorAll("img.winner-photo").forEach((img) => {
    img.addEventListener("error", () => {
      img.onerror = null;
      img.src = DEFAULT_PHOTO;
    });
  });
}

function renderEmptyState() {
  root.innerHTML = `
    <div class="ballot-loading">
      <div class="icon-wrap"><i data-lucide="trophy" class="icon"></i></div>
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
      <h2>Couldn't load final results</h2>
      <p>Something went wrong while loading the results. Please check your connection and try again.</p>
      <button type="button" class="btn-primary retry-btn" id="retry-btn">
        <i data-lucide="refresh-cw" class="icon"></i>
        <span>Retry</span>
      </button>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
  document.getElementById("retry-btn")?.addEventListener("click", () => window.location.reload());
}
