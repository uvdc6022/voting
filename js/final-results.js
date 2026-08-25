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

let lastPositions = null;

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
    const { getDatabase, ref, onValue } = dbModule;

    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);

    let candidates = null;
    let votes = null;

    const renderIfReady = () => {
      if (candidates === null || votes === null) return;

      const voteCounts = countVotes(votes);
      const positions = groupCandidates(candidates, voteCounts);

      if (positions.length === 0) {
        renderEmptyState();
        return;
      }

      lastPositions = positions;
      renderWinners(positions);
    };

    const onError = (err) => {
      console.error(err);
      renderError();
    };

    onValue(ref(db, "candidates"), (snap) => { candidates = snap.val() || {}; renderIfReady(); }, onError);
    onValue(ref(db, "votes"), (snap) => { votes = snap.val() || {}; renderIfReady(); }, onError);
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
  const role = Number(session?.user?.role);

  root.innerHTML = `
    <div class="winners-header">
      <div>
        <h2>Final Results</h2>
        <p>The leading candidate for each position, based on votes cast.</p>
      </div>
      ${
        role === 3
          ? `<button type="button" class="btn-primary winners-export-btn" id="export-results-btn">
              <i data-lucide="download" class="icon"></i>
              <span>Export as Image</span>
            </button>`
          : ""
      }
    </div>
    <div class="winner-grid">
      ${positions.map(winnerCardHtml).join("")}
    </div>
  `;

  hydrateWinnerPhotos(root);
  if (window.lucide) window.lucide.createIcons();

  document
    .getElementById("export-results-btn")
    ?.addEventListener("click", (e) => exportResultsAsImage(e.currentTarget));
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

async function exportResultsAsImage(btn) {
  if (!lastPositions) return;

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-circle" class="icon spin"></i><span>Exporting&hellip;</span>';
  if (window.lucide) window.lucide.createIcons();

  let poster;
  try {
    const html2canvas = await loadHtml2Canvas();
    poster = buildExportPoster(lastPositions);
    // Let the browser load the display font, lay out the poster, and swap in
    // lucide icons before capture.
    await Promise.all([document.fonts.ready, new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))]);

    const canvas = await html2canvas(poster, { backgroundColor: "#0b6e4f", scale: 2, useCORS: true });

    const link = document.createElement("a");
    link.download = `final-results-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();

    btn.innerHTML = '<i data-lucide="check" class="icon"></i><span>Exported!</span>';
  } catch (err) {
    console.error(err);
    btn.innerHTML = '<i data-lucide="circle-alert" class="icon"></i><span>Export failed</span>';
  } finally {
    poster?.remove();
  }

  if (window.lucide) window.lucide.createIcons();
  btn.disabled = false;
  setTimeout(() => {
    btn.innerHTML = originalHtml;
    if (window.lucide) window.lucide.createIcons();
  }, 1500);
}

// Builds an off-screen, purpose-designed "congratulations" poster (rather than
// screenshotting the live theme-aware cards) so the exported PNG always looks
// the same regardless of the viewer's light/dark theme.
function buildExportPoster(positions) {
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const poster = document.createElement("div");
  poster.className = "export-poster";
  poster.innerHTML = `
    <div class="export-poster__glow export-poster__glow--tl"></div>
    <div class="export-poster__glow export-poster__glow--br"></div>
    <div class="export-poster__logo-space">
      <img class="export-poster__logo" src="images/uv-logo.png" alt="UV logo" />
    </div>
    <p class="export-poster__kicker">UV Dalaguete Campus &middot; SSC Officers</p>
    <h1 class="export-poster__title">Congratulations</h1>
    <p class="export-poster__subtitle">to our newly elected SSC officers</p>
    <p class="export-poster__year">School Year 2026-2027</p>
    <div class="export-poster__divider"><i data-lucide="sparkles"></i></div>
    <div class="export-grid">
      ${positions.map(posterCardHtml).join("")}
    </div>
    <div class="export-poster__footer">Official Results &middot; <strong>${escapeHtml(dateStr)}</strong></div>
  `;

  document.body.appendChild(poster);
  hydrateWinnerPhotos(poster);

  const logo = poster.querySelector(".export-poster__logo");
  if (logo) {
    logo.addEventListener("error", () => {
      logo.remove();
    });
  }

  if (window.lucide) window.lucide.createIcons();
  return poster;
}

function posterCardHtml(group) {
  const winners = topCandidates(group);
  return winners.length > 1 ? tiedPosterCardHtml(group, winners) : singleWinnerPosterCardHtml(group, winners[0]);
}

function singleWinnerPosterCardHtml(group, winner) {
  const name = escapeHtml(candidateName(winner));

  return `
    <div class="export-card">
      <span class="export-card__position">${escapeHtml(group.label)}</span>
      <span class="export-card__photo-wrap">
        <img class="export-card__photo winner-photo" data-key="${winner.key}" src="images/${winner.key}.png" alt="${name}" />
        <span class="export-card__crown"><i data-lucide="crown"></i></span>
      </span>
      <strong class="export-card__name">${name}</strong>
    </div>
  `;
}

function tiedPosterCardHtml(group, winners) {
  const names = winners.map((c) => `<strong class="export-card__name">${escapeHtml(candidateName(c))}</strong>`);

  return `
    <div class="export-card tied">
      <span class="export-card__position">${escapeHtml(group.label)}</span>
      <span class="export-card__photo-wrap">
        <img class="export-card__photo winner-photo" src="${DEFAULT_PHOTO}" alt="Tied result" />
      </span>
      <span class="export-card__names">${names.join("")}</span>
      <span class="export-card__tag">Tied</span>
    </div>
  `;
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
