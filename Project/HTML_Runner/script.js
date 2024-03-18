document.addEventListener("DOMContentLoaded", function() {
    const inputArea = document.getElementById('html-input');
    const copyBtn = document.getElementById('copy-btn');
    const pasteBtn = document.getElementById('paste-btn');
    const clearBtn = document.getElementById('clear-btn');
    const runBtn = document.getElementById('run-btn');
    const resultFrame = document.getElementById('result-frame');

    copyBtn.addEventListener('click', () => {
        inputArea.select();
        document.execCommand('copy');
    });

    pasteBtn.addEventListener('click', () => {
        inputArea.focus();
        document.execCommand('paste');
    });

    clearBtn.addEventListener('click', () => {
        inputArea.value = '';
    });
    
    runBtn.addEventListener('click', () => {
        let htmlContent = inputArea.value;
        let newWindow = window.open('', '_blank');
        newWindow.document.write(htmlContent);
    });
});