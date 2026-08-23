// Applied synchronously (classic script, no defer) so the correct theme is
// set before first paint — avoids a light/dark flash. Default is dark.
(function () {
  var THEME_KEY = "uvdc_theme";
  var saved = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch (e) {}
  var theme = saved === "light" || saved === "dark" ? saved : "dark";
  document.documentElement.setAttribute("data-theme", theme);

  window.UVDC_THEME = {
    get: function () {
      return document.documentElement.getAttribute("data-theme");
    },
    set: function (value) {
      document.documentElement.setAttribute("data-theme", value);
      try {
        localStorage.setItem(THEME_KEY, value);
      } catch (e) {}
      window.dispatchEvent(new CustomEvent("uvdc-theme-change", { detail: value }));
    },
    toggle: function () {
      var next = window.UVDC_THEME.get() === "dark" ? "light" : "dark";
      window.UVDC_THEME.set(next);
      return next;
    },
  };
})();
