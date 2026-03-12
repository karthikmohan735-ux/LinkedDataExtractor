/**
 * LinkedIn Tracker Settings Page
 * Google Sheets backend only
 */

// Block malformed fetch/XHR requests at source
const originalFetch = window.fetch;
window.fetch = function(...args) {
    const url = args[0];
    if (!url || typeof url !== 'string' || url === '/' || url === '' || url.includes('/invalid') || 
        url.includes('gf1jbqula7hip12fm2vbpbanv') || !url.startsWith('http')) {
        return Promise.reject(new Error('Invalid URL blocked'));
    }
    return originalFetch.apply(this, args);
};

// ===== DOM Elements — Google Sheets =====
const form = document.getElementById('settingsForm');
const clientEmailInput = document.getElementById('clientEmail');
const privateKeyInput = document.getElementById('privateKey');
const sheetIdInput = document.getElementById('sheetId');
const testBtn = document.getElementById('testBtn');
const resetBtn = document.getElementById('resetBtn');
const statusMessage = document.getElementById('statusMessage');

/**
 * Show status message
 */
function showStatus(message, type = 'info', duration = 3000) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    
    if (duration > 0) {
        setTimeout(() => {
            statusMessage.className = 'status-message';
        }, duration);
    }
}

// ===========================
//  LOAD SETTINGS
// ===========================
async function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(['googleSheetsConfig'], (result) => {
            if (result.googleSheetsConfig) {
                const config = result.googleSheetsConfig;
                clientEmailInput.value = config.client_email || '';
                privateKeyInput.value = config.private_key || '';
                sheetIdInput.value = config.sheet_id || '';
            }

            console.log('Settings loaded successfully');
            resolve();
        });
    });
}

// ===========================
//  GOOGLE SHEETS — SAVE
// ===========================
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const config = {
        client_email: clientEmailInput.value.trim(),
        private_key: privateKeyInput.value.trim(),
        sheet_id: sheetIdInput.value.trim()
    };

    if (!config.client_email || !config.private_key || !config.sheet_id) {
        showStatus('❌ Please fill in all required fields', 'error');
        return;
    }

    if (!config.client_email.includes('@')) {
        showStatus('❌ Invalid email format', 'error');
        return;
    }

    if (!config.private_key.includes('BEGIN PRIVATE KEY')) {
        showStatus('❌ Invalid private key format', 'error');
        return;
    }

    chrome.storage.sync.set({ googleSheetsConfig: config }, () => {
        showStatus('✅ Google Sheets settings saved!', 'success');
        console.log('Google Sheets settings saved');
    });
});

// ===========================
//  GOOGLE SHEETS — TEST
// ===========================
testBtn.addEventListener('click', async () => {
    const config = {
        client_email: clientEmailInput.value.trim(),
        private_key: privateKeyInput.value.trim(),
        sheet_id: sheetIdInput.value.trim()
    };

    if (!config.client_email || !config.private_key || !config.sheet_id) {
        showStatus('❌ Please fill in all fields before testing', 'error');
        return;
    }

    testBtn.disabled = true;
    testBtn.innerHTML = '<span class="loading"></span> Testing...';

    try {
        const db = new (await getGoogleSheetsDB())(config);
        const result = await db.testConnection();

        if (result.success) {
            showStatus(`✅ Google Sheets connected! Found ${result.count} candidates.`, 'success');
        } else {
            showStatus(`❌ Connection failed: ${result.error}`, 'error', 5000);
        }
    } catch (error) {
        showStatus(`❌ Error: ${error.message}`, 'error', 5000);
    } finally {
        testBtn.disabled = false;
        testBtn.innerHTML = '🧪 Test Connection';
    }
});

// ===========================
//  GOOGLE SHEETS — RESET
// ===========================
resetBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear Google Sheets settings?')) {
        clientEmailInput.value = '';
        privateKeyInput.value = '';
        sheetIdInput.value = '';
        chrome.storage.sync.remove(['googleSheetsConfig'], () => {
            showStatus('🔄 Google Sheets settings cleared', 'info');
        });
    }
});

// ===========================
//  INITIALIZE
// ===========================
document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    console.log('Settings page initialized');
});

/**
 * Get GoogleSheetsDB test instance class
 */
async function getGoogleSheetsDB() {
    return class GoogleSheetsDBTest {
        constructor(config) {
            this.credentials = config;
            this.accessToken = null;
        }

        async testConnection() {
            try {
                await this.authenticate();
                const count = await this.getCandidateCount();
                return { success: true, count };
            } catch (error) {
                return { success: false, error: error.message };
            }
        }

        async authenticate() {
            const jwtToken = this.generateJWT();
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                    assertion: jwtToken
                })
            });

            if (!tokenResponse.ok) {
                const errorText = await tokenResponse.text();
                throw new Error(`Authentication failed: ${tokenResponse.status} - ${errorText}`);
            }

            const data = await tokenResponse.json();
            this.accessToken = data.access_token;
        }

        generateJWT() {
            const header = { alg: 'RS256', typ: 'JWT' };
            const now = Math.floor(Date.now() / 1000);
            const payload = {
                iss: this.credentials.client_email,
                scope: 'https://www.googleapis.com/auth/spreadsheets',
                aud: 'https://oauth2.googleapis.com/token',
                exp: now + 3600,
                iat: now
            };

            const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
            const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
            const signature = this.signJWT(encodedHeader + '.' + encodedPayload);
            return encodedHeader + '.' + encodedPayload + '.' + signature;
        }

        signJWT(message) {
            try {
                if (typeof KJUR === 'undefined') {
                    throw new Error('jsrsasign library not loaded. Please reload the extension.');
                }
                const privateKey = this.credentials.private_key.replace(/\\n/g, '\n');
                const sig = new KJUR.crypto.Signature({ "alg": "SHA256withRSA" });
                sig.init(privateKey);
                sig.updateString(message);
                const signatureHex = sig.sign();
                return this.hexToBase64Url(signatureHex);
            } catch (error) {
                console.error('JWT signing error:', error);
                throw new Error('Failed to sign JWT: ' + error.message);
            }
        }

        hexToBase64Url(hex) {
            const base64 = btoa(hex.match(/\w{2}/g).map(byte => String.fromCharCode(parseInt(byte, 16))).join(''));
            return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        }

        base64UrlEncode(str) {
            const base64 = btoa(unescape(encodeURIComponent(str)));
            return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        }

        async getCandidateCount() {
            const response = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${this.credentials.sheet_id}/values/Sheet1!A:W`,
                { headers: { Authorization: `Bearer ${this.accessToken}` } }
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to fetch data: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            const values = data.values || [];
            return Math.max(0, values.length - 1);
        }
    };
}
