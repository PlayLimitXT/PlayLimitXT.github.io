const encryptedText = "U/Y2UUOHkhFKMK89WM/XE1/q2Xb1wAViRQ/5JH+ywMeX60Tl/WJRaBao5o0dJmtIBpHaE9yEUnFUqmSZj/P69YQUdkdygKMSyDRhOFQGq/oQtliqgTz9b1TxFl80WG081cXTTNOUGSuhPayJl/RNL1gUjAISd7LHW8G3qsDoV5ASPywaZ23bsUkZd2Gt4M2ePIFhZGTKLfpFHmzoUFU9R9+ziY5NUqH/g0zfId8LbsP4wEWRdUDCGRYElVrqwriWWehs2RTBCME+LjsK+R1XiuOefoSqFAGpwom7RkVxyA71pVjmNehy+BXU2TuQ54kuJnP0Rq9ZCDEdCnMDA0s9mc3SOdAv0KnwfRMD4vxhsMtEiCtE8EjSYZRAhgcQAaN0N3rNIBILjOs+ADBghACpt9vvRVb8+ONhBKGWg4V11ezWlHUSCaCLrL7DWTitxrbMckzFVAb9T3vumb/BhWz7Igsx/kYzbpEJmOGMCcTiLJhDsSoq04J+eAL+MXOnG4s/Hpb13UR9hScQfWw3YNZuoBwv4eCo7yjUBeDpvcxvxVjUb3eyERBNbyYLnGW91MUN1h1n3RMFDiGTVm9psFfSS3jMEaWMFP+F/GquBurg9hU=";
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