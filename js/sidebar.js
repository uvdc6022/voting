// Common sidebar for every page except index.html. Renders into a
// `<aside id="sidebar-root">` placeholder, enforces the login/role gate,
// and wires up the theme toggle + logout button.
import { getSession, clearSession } from "./session.js";

const NAV_ITEMS = [
  { href: "dashboard.html", label: "Dashboard", icon: "layout-dashboard", roles: [2, 3] },
  { href: "final-results.html", label: "Final Results", icon: "trophy", roles: [2, 3] },
  { href: "cast-vote.html", label: "Cast Vote", icon: "vote", roles: [1, 2, 3] },
  { href: "users.html", label: "Users", icon: "users", roles: [2, 3] },
  { href: "voter-records.html", label: "Voter Records", icon: "list-checks", roles: [3] },
  { href: "admins.html", label: "Admins", icon: "shield", roles: [3] },
];

// Returns the active session, or null after redirecting away (not logged in,
// or a role-1 voter trying to reach a page other than cast-vote.html).
export function initSidebar(activePage) {
  const session = getSession();
  if (!session) {
    window.location.replace("index.html");
    return null;
  }

  const user = session.user || {};
  const role = Number(user.role);

  if (role === 1 && activePage !== "cast-vote.html") {
    window.location.replace("cast-vote.html");
    return null;
  }

  const root = document.getElementById("sidebar-root");
  if (!root) return session;

  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Voter";

  // Off-canvas drawer needs a mobile top bar (hamburger + brand) and a
  // backdrop, neither of which exist in the per-page markup. Create them
  // once here rather than duplicating them in every page's HTML.
  let topbar = document.getElementById("mobile-topbar");
  if (!topbar) {
    topbar = document.createElement("div");
    topbar.id = "mobile-topbar";
    topbar.className = "mobile-topbar";
    topbar.innerHTML = `
      <button id="sidebar-toggle" class="sidebar-toggle" type="button" aria-label="Open navigation menu" aria-expanded="false">
        <i data-lucide="menu" class="icon"></i>
      </button>
      <div class="mobile-topbar-brand">
        <div class="brand-mark"><i data-lucide="vote" class="icon"></i></div>
        <strong>UV Dalaguete</strong>
      </div>
    `;
    document.body.prepend(topbar);
  }

  let backdrop = document.getElementById("sidebar-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "sidebar-backdrop";
    backdrop.className = "sidebar-backdrop";
    document.body.appendChild(backdrop);
  }

  root.innerHTML = `
    <div class="sidebar-brand">
      <div class="brand-mark"><i data-lucide="vote" class="icon"></i></div>
      <div class="brand-text">
        <strong>UV Dalaguete</strong>
        <span>Campus Voting</span>
      </div>
      <button id="sidebar-close" class="sidebar-close" type="button" aria-label="Close navigation menu">
        <i data-lucide="x" class="icon"></i>
      </button>
    </div>
    <nav class="sidebar-nav">
      ${items
        .map(
          (item) => `
        <a href="${item.href}" class="sidebar-link${item.href === activePage ? " active" : ""}">
          <i data-lucide="${item.icon}" class="icon"></i>
          <span>${item.label}</span>
        </a>`
        )
        .join("")}
    </nav>
    <div class="sidebar-footer">
      <div class="sidebar-user">
        <strong>${fullName}</strong>
        <span>ID ${user.idNumber ?? ""}</span>
      </div>
      <div class="sidebar-actions">
        <button id="theme-toggle" class="theme-toggle" type="button" aria-label="Toggle dark and light theme">
          <i data-lucide="sun-moon" class="icon"></i>
        </button>
        <button id="logout-btn" class="btn-ghost" type="button">
          <i data-lucide="log-out" class="icon"></i>
          <span>Logout</span>
        </button>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const closeDrawer = () => {
    document.body.classList.remove("sidebar-open");
    document.getElementById("sidebar-toggle")?.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", onKeydown);
  };
  const openDrawer = () => {
    document.body.classList.add("sidebar-open");
    document.getElementById("sidebar-toggle")?.setAttribute("aria-expanded", "true");
    document.addEventListener("keydown", onKeydown);
  };
  const onKeydown = (e) => {
    if (e.key === "Escape") closeDrawer();
  };

  document.getElementById("sidebar-toggle")?.addEventListener("click", () => {
    document.body.classList.contains("sidebar-open") ? closeDrawer() : openDrawer();
  });
  document.getElementById("sidebar-close")?.addEventListener("click", closeDrawer);
  backdrop.addEventListener("click", closeDrawer);
  root.querySelectorAll(".sidebar-link").forEach((link) => link.addEventListener("click", closeDrawer));

  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    window.UVDC_THEME.toggle();
  });
  document.getElementById("logout-btn")?.addEventListener("click", () => {
    clearSession();
    window.location.replace("index.html");
  });

  return session;
}
