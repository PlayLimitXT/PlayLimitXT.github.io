const encryptedText = "ScpaLq/PwMgCPa1VzEOfEHRy5M9UfTob8U6OWDeMmxncvgxY6SxXxRtNxYMMsOrf92kfi70tJZC6HeClJ3ibk8qhNUMaXVavO6BnhDkzNWk=";
const keyHash = "d1a6cc870f4743d4830b75462e56855a580bdd514bbefa0ef4e2f418db968b59"

function decrypt() {
	const userKey = document.getElementById('keyInput')
		.value;
	const userKeyHash = CryptoJS.SHA256(userKey)
		.toString(CryptoJS.enc.Hex);
	if (userKeyHash === keyHash) {
		const decryptedText = CryptoJS.AES.decrypt(
			encryptedText,
			CryptoJS.enc.Utf8.parse(userKey), {
				mode: CryptoJS.mode.ECB,
				padding: CryptoJS.pad.Pkcs7
			}
		);
		const plainText = decryptedText.toString(CryptoJS.enc.Utf8);
		document.getElementById('secretText')
			.innerText = plainText;
		document.getElementById('secretText')
			.style.display = 'block';
	} else {
		alert('Invalid Key');
	}
}