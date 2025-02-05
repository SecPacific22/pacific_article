document.getElementById("copy-link-button").addEventListener("click", function () {
  if (!navigator.clipboard) {
    console.error("Clipboard API não suportada.");
    return;
  }

  const link = window.location.href;
  navigator.clipboard.writeText(link);

  const alertDiv = document.getElementById("copy-alert");
  alertDiv.classList.add("show");

  setTimeout(function () {
    alertDiv.classList.remove("show");
  }, 2000);
});
