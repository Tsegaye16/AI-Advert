(function () {
  try {
    var stored = localStorage.getItem("advault.theme");
    var mode =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    document.documentElement.setAttribute("data-theme", mode);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", mode === "dark" ? "#0b0e14" : "#ffffff");
  } catch {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
