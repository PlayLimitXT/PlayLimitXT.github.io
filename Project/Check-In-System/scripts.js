document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const employeeIdInput = document.getElementById('employee-id').value;
    const employeeIdExpected = 'PLXT_' + btoa(username);
    if (employeeIdInput !== employeeIdExpected) {
        document.getElementById('result').innerHTML = '<p style="color: red;">无效的用户名或ID！<br>"Invalid username or ID!"</p>';
        return;
    }
    let theTime;
    let theUsername;
    let theResult;
    const now = new Date();
    const timestamp = now.getTime();
    const attendanceCookie = getCookie('attendance');
    if (attendanceCookie) {
        const parsedCookie = JSON.parse(attendanceCookie);
        theTime = new Date(parsedCookie.timestamp);
        theUsername = parsedCookie.username;
        theResult = "您已经打卡过了！\nYou have already checked in! ";
    }else{
        theTime = new Date();
        theUsername = username;
        theResult = "成功！Success!";
        setCookie('attendance', JSON.stringify({ username, timestamp }), 1);
    }
    const newWindow = window.open("", "_blank");
    newWindow.document.write(`
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="msapplication-TileImage" content="../../images/favicon.png" />
  <meta name="author" content="Play_Limit,PlayLimitXT@gmail.com">
  <meta name="copyright" content="Copyright © 2024 Play_Limit">
  <meta name="robots" content="unindex,unfollow" />
  <meta name="revisit-after" content="7 days" >
  <link rel="shortcut icon" href="../../images/favicon.png" type="image/x-icon">
  <link rel="icon" href="../../images/favicon.png" type="image/x-icon">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-H1BZQVCCRE"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-H1BZQVCCRE');
  </script>
    <title>成功 Success</title>
    <style>
        body {
            background-color: #f5f5f5;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        .card-container {
            background-color: white;
            border-radius: 20px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            overflow: hidden;
            width: 375px;
            max-width: 90%;
            padding: 3rem;
        }
        h1 {
            color: green;
            font-size: 2.5rem;
            text-align: center;
            margin-bottom: 2rem;
        }
        .details-container {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            align-items: center;
        }
        .detail-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background-color: #e0f7fa;
            border-radius: ⅓rem;
            padding: 0.75rem 1rem;
            color: #00695c;
            font-weight: bold;
        }
        .detail-item span:first-child {
            flex: 1;
            text-align: right;
            padding-right: 1rem;
        }
        .time-container {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 0.5rem;
            margin-top: 1rem;
        }
        .time {
            color: #00695c;
            font-size: 1.5rem;
            font-weight: bold;
        }
        .local-time {
            font-size: 1rem;
            color: #607d8b;
        }
    </style>
</head>
<body>
    <div class="card-container">
        <h1>${theResult}</h1>
        <div class="details-container">
            <div class="detail-item">
                <span>用户名 Username:</span>
                <span>${theUsername}</span>
            </div>
            <div class="detail-item">
                <span>ID:</span>
                <span>${btoa(theUsername)}</span>
            </div>
        </div>
        <div class="time-container">
            <span>时间 Time:</span>
            <span class="time">PLXT_${theTime}</span>
        </div>
    </div>
</body>
</html>
    `);
});

function getCookie(name) {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
        const [key, value] = cookie.trim().split('=');
        if (key === name) {
            return decodeURIComponent(value);
        }
    }
    return null;
}

function setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}
