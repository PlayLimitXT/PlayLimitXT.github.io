// DOM Elements
const regexInput = document.getElementById('regex-input');
const testInput = document.getElementById('test-input');
const resultOutput = document.getElementById('result-output');
const groupsOutput = document.getElementById('groups-output');
const matchCount = document.getElementById('match-count');
const flagsDisplay = document.getElementById('flags-display');
const regexError = document.getElementById('regex-error');
const clearBtn = document.getElementById('clear-btn');

// Flags
const flagG = document.getElementById('flag-g');
const flagI = document.getElementById('flag-i');
const flagM = document.getElementById('flag-m');
const flagS = document.getElementById('flag-s');

// Get current flags
function getFlags() {
    let flags = '';
    if (flagG.checked) flags += 'g';
    if (flagI.checked) flags += 'i';
    if (flagM.checked) flags += 'm';
    if (flagS.checked) flags += 's';
    return flags;
}

// Update flags display
function updateFlagsDisplay() {
    flagsDisplay.textContent = getFlags() || '';
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Test regex
function testRegex() {
    const pattern = regexInput.value;
    const text = testInput.value;
    const flags = getFlags();

    // Clear error
    regexError.classList.remove('show');
    regexError.textContent = '';

    // Empty pattern
    if (!pattern) {
        resultOutput.innerHTML = '<div class="placeholder">Enter a regex pattern to start...</div>';
        groupsOutput.innerHTML = '<div class="placeholder">No capture groups found...</div>';
        matchCount.textContent = '0 matches';
        return;
    }

    // Try to create regex
    let regex;
    try {
        regex = new RegExp(pattern, flags);
    } catch (e) {
        regexError.textContent = `Invalid regex: ${e.message}`;
        regexError.classList.add('show');
        resultOutput.innerHTML = '<div class="placeholder">Fix the regex error...</div>';
        matchCount.textContent = 'Error';
        return;
    }

    // Empty text
    if (!text) {
        resultOutput.innerHTML = '<div class="placeholder">Enter text to test...</div>';
        groupsOutput.innerHTML = '<div class="placeholder">No capture groups found...</div>';
        matchCount.textContent = '0 matches';
        return;
    }

    // Find matches
    const matches = [];
    const groups = [];
    let match;

    if (flags.includes('g')) {
        while ((match = regex.exec(text)) !== null) {
            matches.push({
                value: match[0],
                index: match.index,
                groups: match.slice(1)
            });

            // Prevent infinite loop for zero-length matches
            if (match[0].length === 0) {
                regex.lastIndex++;
            }
        }
    } else {
        match = regex.exec(text);
        if (match) {
            matches.push({
                value: match[0],
                index: match.index,
                groups: match.slice(1)
            });
        }
    }

    // Update match count
    matchCount.textContent = `${matches.length} match${matches.length !== 1 ? 'es' : ''}`;

    // Display matches
    if (matches.length === 0) {
        resultOutput.innerHTML = '<div class="placeholder">No matches found</div>';
        groupsOutput.innerHTML = '<div class="placeholder">No capture groups found...</div>';
        return;
    }

    // Render matches
    let matchesHtml = '';
    matches.forEach((m, i) => {
        matchesHtml += `
            <div class="match-item" title="Index: ${m.index}">
                <span class="match-index">#${i + 1}</span>
                <span class="match-value">${escapeHtml(m.value)}</span>
            </div>
        `;

        // Collect groups
        if (m.groups && m.groups.length > 0) {
            m.groups.forEach((g, gi) => {
                if (g !== undefined) {
                    groups.push({
                        matchIndex: i + 1,
                        groupIndex: gi + 1,
                        value: g
                    });
                }
            });
        }
    });
    resultOutput.innerHTML = matchesHtml;

    // Display groups
    if (groups.length === 0) {
        groupsOutput.innerHTML = '<div class="placeholder">No capture groups found...</div>';
    } else {
        let groupsHtml = '';
        groups.forEach(g => {
            groupsHtml += `
                <div class="group-item">
                    <span class="group-name">Group ${g.groupIndex}</span>
                    <span class="group-value">${escapeHtml(g.value)}</span>
                </div>
            `;
        });
        groupsOutput.innerHTML = groupsHtml;
    }
}

// Clear text
clearBtn.addEventListener('click', () => {
    testInput.value = '';
    testRegex();
});

// Event listeners
regexInput.addEventListener('input', testRegex);
testInput.addEventListener('input', testRegex);
flagG.addEventListener('change', () => { updateFlagsDisplay(); testRegex(); });
flagI.addEventListener('change', () => { updateFlagsDisplay(); testRegex(); });
flagM.addEventListener('change', () => { updateFlagsDisplay(); testRegex(); });
flagS.addEventListener('change', () => { updateFlagsDisplay(); testRegex(); });

// Initial test
testRegex();
