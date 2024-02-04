const encryptedText = "ek69bmnrLbVLmRh8baKgDH18GK1zmsR3j2pHkgyCIg99ZdkRdveatR9Z5eA3bNGX4/pi/zd6+BqWAZQRc1LTVLRa6aUfrIpE7UFepYXDUXqdva+1SwYiPqmHKuaSTFUNgXz8eEetntXEnxIpPQpWpwvyiyzvkCIU5bwbTZVl6YHUKIysAdoYxkzTRYhdK0B347OeEVLO02CcAqOJHjtxU2AtsNhbNP1UVUNb/CLtVCZP/GE7S8EhhbRXaNkIakOzNDGmttpkDrtpRhvGl7BcKsaQsDkt7qM5OR4zUlBqff5IMntlINXoPWSNSUWxeX0Jid1YyUiXxoTVLu22HNeK9AWUZ1b5ccCUpPEeoo6b0O0=";
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