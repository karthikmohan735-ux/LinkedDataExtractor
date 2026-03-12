/**
 * LinkedIn Candidate Tracker - Popup Script (Google Sheets Version)
 */

// Block malformed fetch/XHR requests at source
const originalFetch = window.fetch;
window.fetch = function(...args) {
    const url = args[0];
    // Silently reject invalid requests without logging
    if (!url || typeof url !== 'string' || url === '/' || url === '' || url.includes('/invalid') || 
        url.includes('gf1jbqula7hip12fm2vbpbanv') || !url.startsWith('http')) {
        return Promise.reject(new Error('Invalid URL blocked'));
    }
    return originalFetch.apply(this, args);
};

// DOM elements
const totalCandidatesEl = document.getElementById('totalCandidates');
const serverStatusEl = document.getElementById('serverStatus');
const recheckBtn = document.getElementById('recheckBtn');
const viewAllBtn = document.getElementById('viewAllBtn');
const settingsBtn = document.getElementById('settingsBtn');
const deleteBtn = document.getElementById('deleteBtn');
const statusMessage = document.getElementById('statusMessage');
const uploadBtn = document.getElementById('uploadBtn');
const excelFileInput = document.getElementById('excelFileInput');
const fileName = document.getElementById('fileName');
const processFileBtn = document.getElementById('processFileBtn');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

let uploadedUrls = [];

/**
 * Show status message
 */
function showStatus(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`;
    statusMessage.style.display = 'block';
    
    setTimeout(() => {
        statusMessage.style.display = 'none';
    }, 3000);
}

/**
 * Check Google Sheets configuration status
 */
async function checkConfigurationStatus() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(['googleSheetsConfig'], (result) => {
            if (result.googleSheetsConfig && result.googleSheetsConfig.private_key) {
                serverStatusEl.textContent = '🟢 Google Sheets';
                serverStatusEl.style.color = '#4caf50';
                resolve(true);
            } else {
                serverStatusEl.textContent = '🔴 Not Configured';
                serverStatusEl.style.color = '#f44336';
                resolve(false);
            }
        });
    });
}

/**
 * Get total candidates count
 */
async function getTotalCandidates() {
    try {
        // In a full implementation, would fetch from Google Sheets
        // For now, show placeholder
        totalCandidatesEl.textContent = '—';
    } catch (error) {
        totalCandidatesEl.textContent = 'Error';
        console.error('Failed to fetch candidate count:', error);
    }
}

/**
 * Recheck current profile
 */
recheckBtn.addEventListener('click', async () => {
    try {
        recheckBtn.innerHTML = '<span class="loading"></span> Checking...';
        recheckBtn.disabled = true;
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url?.includes('linkedin.com')) {
            showStatus('Please open a LinkedIn profile page', 'error');
            return;
        }
        chrome.tabs.sendMessage(tab.id, { action: 'recheck' }, (response) => {
            if (chrome.runtime.lastError) {
                showStatus('Please refresh the LinkedIn page', 'error');
            } else if (response && response.success) {
                showStatus('Profile rechecked successfully!', 'success');
                getTotalCandidates();
            }
        });
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
    } finally {
        recheckBtn.innerHTML = '♻️ Recheck Current Profile';
        recheckBtn.disabled = false;
    }
});

/**
 * Open Settings page
 */
settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});

/**
 * Open Google Sheet
 */
viewAllBtn.addEventListener('click', async () => {
    const result = await new Promise((resolve) => {
        chrome.storage.sync.get(['googleSheetsConfig'], (r) => resolve(r));
    });

    if (result.googleSheetsConfig && result.googleSheetsConfig.sheet_id) {
        const sheetUrl = `https://docs.google.com/spreadsheets/d/${result.googleSheetsConfig.sheet_id}/edit`;
        chrome.tabs.create({ url: sheetUrl });
    } else {
        showStatus('Please configure Google Sheets in Settings first', 'error');
    }
});

/**
 * Delete current candidate from sheet
 */
deleteBtn.addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url?.includes('linkedin.com')) {
            showStatus('Please open a LinkedIn profile page', 'error');
            return;
        }

        if (!confirm('Are you sure you want to delete this candidate from the sheet?')) {
            return;
        }

        deleteBtn.innerHTML = '<span class="loading"></span> Deleting...';
        deleteBtn.disabled = true;

        chrome.tabs.sendMessage(tab.id, { action: 'deleteCurrentCandidate' }, (response) => {
            if (chrome.runtime.lastError) {
                showStatus('Please refresh the LinkedIn page first', 'error');
            } else if (response && response.success) {
                showStatus('Candidate deleted successfully!', 'success');
                getTotalCandidates();
            } else {
                showStatus(response?.error || 'Failed to delete candidate', 'error');
            }
            deleteBtn.innerHTML = '🗑️ Delete Current Candidate';
            deleteBtn.disabled = false;
        });
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
        deleteBtn.innerHTML = '🗑️ Delete Current Candidate';
        deleteBtn.disabled = false;
    }
});

/**
 * Initialize popup
 */
async function init() {
    const isConfigured = await checkConfigurationStatus();
    if (isConfigured) {
        await getTotalCandidates();
    }
}

/**
 * Handle file upload button click
 */
uploadBtn.addEventListener('click', () => {
    excelFileInput.click();
});

/**
 * Handle file selection
 */
excelFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    fileName.textContent = file.name;
    processFileBtn.style.display = 'block';

    try {
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                uploadedUrls = await parseExcelFile(event.target.result, file.name);
                showStatus(`Found ${uploadedUrls.length} URLs in the file`, 'success');
            } catch (error) {
                showStatus('Error parsing file: ' + error.message, 'error');
                processFileBtn.style.display = 'none';
            }
        };

        if (file.name.endsWith('.csv')) {
            reader.readAsText(file);
        } else {
            reader.readAsArrayBuffer(file);
        }
    } catch (error) {
        showStatus('Error reading file: ' + error.message, 'error');
    }
});

/**
 * Parse Excel/CSV file to extract LinkedIn URLs
 */
async function parseExcelFile(data, filename) {
    let urls = [];

    if (filename.endsWith('.csv')) {
        // Parse CSV
        const text = data;
        const lines = text.split('\n');
        
        for (const line of lines) {
            const cells = line.split(',').map(cell => cell.trim().replace(/['"]/g, ''));
            for (const cell of cells) {
                if (cell && (cell.includes('linkedin.com/in/') || cell.includes('linkedin.com/talent/') || cell.includes('linkedin.com/recruiter/'))) {
                    urls.push(cell);
                }
            }
        }
    } else {
        // Load and parse Excel file using SheetJS
        try {
            // Load SheetJS library dynamically
            await loadSheetJSLibrary();
            
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

            // Extract URLs from all cells
            for (const row of jsonData) {
                for (const cell of row) {
                    if (cell && typeof cell === 'string' && 
                        (cell.includes('linkedin.com/in/') || 
                         cell.includes('linkedin.com/talent/') || 
                         cell.includes('linkedin.com/recruiter/'))) {
                        urls.push(cell);
                    }
                }
            }
        } catch (error) {
            throw new Error('Failed to parse Excel file. Make sure it\'s a valid .xlsx or .xls file.');
        }
    }

    // Remove duplicates and invalid URLs
    urls = [...new Set(urls)].filter(url => {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    });

    if (urls.length === 0) {
        throw new Error('No valid LinkedIn URLs found in the file');
    }

    return urls;
}

/**
 * Load SheetJS library dynamically
 */
function loadSheetJSLibrary() {
    return new Promise((resolve, reject) => {
        if (typeof XLSX !== 'undefined') {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('xlsx.full.min.js');
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Excel library'));
        document.head.appendChild(script);
    });
}

/**
 * Process uploaded URLs
 */
processFileBtn.addEventListener('click', async () => {
    if (uploadedUrls.length === 0) {
        showStatus('No URLs to process', 'error');
        return;
    }

    const isConfigured = await checkConfigurationStatus();
    if (!isConfigured) {
        showStatus('Please configure Google Sheets first', 'error');
        return;
    }

    if (!confirm(`Process ${uploadedUrls.length} LinkedIn profiles? This may take several minutes.`)) {
        return;
    }

    processFileBtn.disabled = true;
    processFileBtn.innerHTML = '<span class="loading"></span> Processing...';
    uploadProgress.style.display = 'block';
    
    // Send URLs to background script for processing
    chrome.runtime.sendMessage({
        action: 'processBatchUrls',
        urls: uploadedUrls
    }, (response) => {
        if (response && response.success) {
            showStatus(`Started processing ${uploadedUrls.length} profiles`, 'success');
        } else {
            showStatus('Failed to start batch processing', 'error');
            processFileBtn.disabled = false;
            processFileBtn.innerHTML = '🚀 Process URLs';
            uploadProgress.style.display = 'none';
        }
    });
});

/**
 * Listen for processing progress updates
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'batchProcessingProgress') {
        const { current, total, completed } = message;
        const percentage = (completed / total) * 100;
        
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `${completed} / ${total} profiles processed`;
        
        if (completed === total) {
            processFileBtn.disabled = false;
            processFileBtn.innerHTML = '🚀 Process URLs';
            showStatus(`Successfully processed ${completed} profiles!`, 'success');
            setTimeout(() => {
                uploadProgress.style.display = 'none';
                fileName.textContent = '';
                processFileBtn.style.display = 'none';
                excelFileInput.value = '';
                uploadedUrls = [];
            }, 3000);
        }
    }
});

init();

setInterval(() => {
    checkConfigurationStatus();
    getTotalCandidates();
}, 30000);

