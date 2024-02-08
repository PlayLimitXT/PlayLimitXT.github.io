let keyHashes = [
    "d1a6cc870f4743d4830b75462e56855a580bdd514bbefa0ef4e2f418db968b59",
    "e6dd64117412d80feae8ef881a01472037095f396dd9bb6788c9e2d1dada8867",
    "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8"
];

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
      alert("Invalid username or password");
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
      alert("Invalid username or password");
    }
  });
});
