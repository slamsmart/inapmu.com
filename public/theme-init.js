// Apply the saved theme before first paint so dark mode doesn't flash white.
// Kept as an external file because the CSP disallows inline scripts.
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem("inapmu-theme");
  } catch (e) {}
  if (theme !== "dark" && theme !== "light") {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.classList.toggle("dark", theme === "dark");
})();
