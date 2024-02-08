let keyHashes = ["d1a6cc870f4743d4830b75462e56855a580bdd514bbefa0ef4e2f418db968b59"];

document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("login-form");
  const errorMessage = document.getElementById("error-message");
  const decodedContent = document.getElementById("decoded-content");
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    errorMessage.classList.add("hidden");
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const hashedKey = CryptoJS.SHA256(password).toString();
    if (!keyHashes.includes(hashedKey)) {
      errorMessage.textContent = "Invalid username or password";
      errorMessage.classList.remove("hidden");
      return;
    }
    try {
      const encryptedHTML = await fetch(`./Pages/${username}.txt`).then(res => res.text());
      var decryptedHTML = CryptoJS.AES.decrypt(
        encryptedHTML,
        CryptoJS.enc.Utf8.parse(password), {
          mode: CryptoJS.mode.ECB,
          padding: CryptoJS.pad.Pkcs7
        }
      );
      decryptedHTML = decryptedHTML.toString(CryptoJS.enc.Utf8);
      const newWindow = window.open("", "_blank");
      newWindow.document.write(decryptedHTML);
    } catch (error) {
      errorMessage.textContent = "Invalid username or password";
      errorMessage.classList.remove("hidden");
    }
  });
});
