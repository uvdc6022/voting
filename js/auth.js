import { getSession, setSession, landingPageFor } from "./session.js";

const form = document.getElementById("login-form");
const idInput = document.getElementById("id-number");
const lastnameInput = document.getElementById("lastname");
const togglePasswordBtn = document.getElementById("toggle-password");
const alertBox = document.getElementById("alert");
const alertText = document.getElementById("alert-text");
const submitBtn = document.getElementById("submit-btn");
const submitIcon = document.getElementById("submit-icon");
const submitLabel = document.getElementById("submit-label");

// Already logged in? Skip straight to their landing page — no Firebase call needed.
const existingSession = getSession();
if (existingSession) {
  window.location.replace(landingPageFor(existingSession.user));
}

togglePasswordBtn.addEventListener("click", () => {
  const isPassword = lastnameInput.type === "password";
  lastnameInput.type = isPassword ? "text" : "password";
  togglePasswordBtn.innerHTML = isPassword
    ? '<i data-lucide="eye-off" class="icon"></i>'
    : '<i data-lucide="eye" class="icon"></i>';
  if (window.lucide) window.lucide.createIcons();
});

function showError(message) {
  alertText.textContent = message;
  alertBox.classList.add("show");
}

function hideError() {
  alertBox.classList.remove("show");
}

function setLoading(loading) {
  submitBtn.disabled = loading;
  submitIcon.innerHTML = loading
    ? '<i data-lucide="loader-circle" class="icon spin"></i>'
    : '<i data-lucide="log-in" class="icon"></i>';
  submitLabel.textContent = loading ? "Signing in..." : "Sign In";
  if (window.lucide) window.lucide.createIcons();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideError();

  const idNumber = idInput.value.trim();
  const lastname = lastnameInput.value.trim();

  if (!idNumber || !lastname) {
    showError("Please enter both your ID number and lastname.");
    return;
  }

  setLoading(true);

  try {
    // Firebase is only loaded/called right here, on an actual login
    // attempt — never on page load — to keep usage/metrics minimal.
    const [{ initializeApp }, { getDatabase, ref, get }, { firebaseConfig }] =
      await Promise.all([
        import("https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js"),
        import("./firebase-config.js"),
      ]);

    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);

    const snapshot = await get(ref(db, `users/${idNumber}`));

    if (!snapshot.exists()) {
      showError("Invalid ID number or lastname.");
      setLoading(false);
      return;
    }

    const user = snapshot.val();
    const storedLastname = String(user.lastName || "").trim().toLowerCase();

    if (storedLastname !== lastname.toLowerCase()) {
      showError("Invalid ID number or lastname.");
      setLoading(false);
      return;
    }

    setSession(user);
    window.location.replace(landingPageFor(user));
  } catch (err) {
    console.error(err);
    showError("Something went wrong while signing in. Please try again.");
    setLoading(false);
  }
});
