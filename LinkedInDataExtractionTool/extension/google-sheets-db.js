/**
 * Google Sheets Database Module
 * Handles all interactions with Google Sheets API
 */

class GoogleSheetsDB {
    constructor() {
        this.credentials = null;
        this.accessToken = null;
        this.tokenExpiry = null;
        this.apiUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
        this.appendUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
        this.loadCredentials();
    }

    /**
     * Load credentials from Chrome storage
     */
    loadCredentials() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(['googleSheetsConfig'], (result) => {
                if (result.googleSheetsConfig) {
                    this.credentials = result.googleSheetsConfig;
                    console.log('[GoogleSheetsDB] Credentials loaded');
                    resolve(true);
                } else {
                    console.warn('[GoogleSheetsDB] No credentials found');
                    resolve(false);
                }
            });
        });
    }

    /**
     * Save credentials to Chrome storage
     */
    saveCredentials(config) {
        return new Promise((resolve) => {
            this.credentials = config;
            chrome.storage.sync.set({ googleSheetsConfig: config }, () => {
                console.log('[GoogleSheetsDB] Credentials saved');
                resolve(true);
            });
        });
    }

    /**
     * Authenticate with Google API
     */
    async authenticate() {
        if (!this.credentials) {
            throw new Error('Credentials not configured. Please set up in Settings.');
        }
        
        // Validate credentials before attempting authentication
        if (!this.credentials.client_email || !this.credentials.private_key || !this.credentials.sheet_id) {
            throw new Error('Invalid credentials: Missing required fields (client_email, private_key, or sheet_id).');
        }

        // Check if token is still valid
        if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        try {
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
                throw new Error(`Authentication failed: ${tokenResponse.statusText}`);
            }

            const data = await tokenResponse.json();
            this.accessToken = data.access_token;
            this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Refresh 1 min before expiry

            console.log('[GoogleSheetsDB] Authentication successful');
            return this.accessToken;
        } catch (error) {
            console.error('[GoogleSheetsDB] Authentication error:', error);
            throw error;
        }
    }

    /**
     * Generate JWT token for service account
     */
    generateJWT() {
        const header = {
            alg: 'RS256',
            typ: 'JWT'
        };

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

    /**
     * Sign JWT with private key using RSA-SHA256
     */
    signJWT(message) {
        try {
            // Validate credentials are set
            if (!this.credentials || !this.credentials.private_key) {
                throw new Error('Private key not configured');
            }
            
            // Check if jsrsasign is loaded
            if (typeof KJUR === 'undefined') {
                throw new Error('jsrsasign library not loaded. Please reload the extension.');
            }
            
            // Validate private key format
            const privateKey = this.credentials.private_key.replace(/\\n/g, '\n');
            if (!privateKey.includes('BEGIN PRIVATE KEY') || !privateKey.includes('END PRIVATE KEY')) {
                throw new Error('Invalid private key format. Must be a valid PEM-formatted private key.');
            }
            
            // Create RSA key object from PEM string
            const sig = new KJUR.crypto.Signature({ "alg": "SHA256withRSA" });
            sig.init(privateKey);
            sig.updateString(message);
            const signatureHex = sig.sign();
            
            // Validate signature was generated
            if (!signatureHex || signatureHex.length === 0) {
                throw new Error('Failed to generate JWT signature');
            }
            
            // Convert hex signature to base64url
            return this.hexToBase64Url(signatureHex);
        } catch (error) {
            console.error('[GoogleSheetsDB] JWT signing error:', error);
            throw new Error('Failed to sign JWT: ' + error.message);
        }
    }

    /**
     * Convert hex to base64 URL encoded string
     */
    hexToBase64Url(hex) {
        const base64 = btoa(hex.match(/\w{2}/g).map(byte => String.fromCharCode(parseInt(byte, 16))).join(''));
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    /**
     * Base64 URL encode
     */
    base64UrlEncode(str) {
        const base64 = btoa(unescape(encodeURIComponent(str)));
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    // ============ 25-FIELD SCHEMA (A–Y) ============
    // A: Sl.No | B: Date | C: Candidate Name | D: Designation | E: Location
    // F: Total Exp | G: Current Company | H: Notes | I: Linked In URL | J: Email
    // K: Phone Number | L: POOL Name | M: Client Name | N: Current Salary LPA
    // O: Expected Salary LPA | P: Notice Period Days | Q: HR Name | R: File Name
    // S: Years at Current Company | T: Education | U: Passout Year
    // =================================================

    static HEADERS = [
        "Sl.No", "Date", "Candidate Name", "Designation", "Location",
        "Total Exp", "Current Company", "Notes", "Linked In URL", "Email",
        "Phone Number", "POOL Name", "Client Name", "Current Salary LPA",
        "Expected Salary LPA", "Notice Period Days", "HR Name", "File Name",
        "Years at Current Company", "Education", "Passout Year"
    ];

    /**
     * Ensure header row exists in the sheet.
     * Writes headers only if the first row is empty (first-time export).
     * Also applies header styling and sets column widths.
     */
    async ensureHeaders() {
        try {
            const token = await this.authenticate();
            const response = await fetch(
                `${this.apiUrl}/${this.credentials.sheet_id}/values/Sheet1!A1:U1`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (!response.ok) {
                throw new Error(`Failed to read sheet: ${response.statusText}`);
            }

            const data = await response.json();
            const values = data.values || [];

            if (values.length === 0 || !values[0] || values[0].length === 0) {
                const writeResponse = await fetch(
                    `${this.apiUrl}/${this.credentials.sheet_id}/values/Sheet1!A1:U1?valueInputOption=USER_ENTERED`,
                    {
                        method: 'PUT',
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ values: [GoogleSheetsDB.HEADERS] })
                    }
                );

                if (!writeResponse.ok) {
                    throw new Error(`Failed to write headers: ${writeResponse.statusText}`);
                }
                console.log('[GoogleSheetsDB] Headers written successfully');
            } else {
                console.log('[GoogleSheetsDB] Headers already exist, skipping write');
            }

            // Always apply header styling (ensures white bold text, blue bg, column widths)
            await this.applyHeaderFormatting(token);
        } catch (error) {
            console.error('[GoogleSheetsDB] Error ensuring headers:', error);
            throw error;
        }
    }

    /**
     * Apply header row styling and set column widths via Sheets batchUpdate API.
     * - Header: dark blue (#1F4E78) background, white bold text, centered, frozen
     * - Column widths: sized per content type (narrow for Sl.No, wide for URLs, etc.)
     */
    async applyHeaderFormatting(token) {
        try {
            // Column widths in pixels – tuned per field
            // A:Sl.No  B:Date  C:Name  D:Designation  E:Location  F:TotalExp
            // G:Company  H:Notes  I:URL  J:Email  K:Phone  L:POOL  M:Client
            // N:CurSalary  O:ExpSalary  P:Notice  Q:HRName  R:FileName
            // S:YrsAtCurrent  T:Education  U:PassoutYear
            const columnWidths = [
                55,   // A: Sl.No
                85,   // B: Date
                170,  // C: Candidate Name
                180,  // D: Designation
                140,  // E: Location
                110,  // F: Total Exp
                180,  // G: Current Company
                200,  // H: Notes
                260,  // I: Linked In URL
                180,  // J: Email
                130,  // K: Phone Number
                110,  // L: POOL Name
                110,  // M: Client Name
                110,  // N: Current Salary LPA
                110,  // O: Expected Salary LPA
                110,  // P: Notice Period Days
                110,  // Q: HR Name
                110,  // R: File Name
                110,  // S: Years at Current Company
                110,  // T: Education
                110   // U: Passout Year
            ];

            const requests = [];

            // 1) Style header row: beige bg, black bold text, centered, wrapped
            requests.push({
                repeatCell: {
                    range: {
                        sheetId: 0,
                        startRowIndex: 0,
                        endRowIndex: 1,
                        startColumnIndex: 0,
                        endColumnIndex: 21  // A–U = 21 columns
                    },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: { red: 1, green: 1, blue: 0 },  // yellow #FFFF00
                            textFormat: {
                                foregroundColor: { red: 0, green: 0, blue: 0 },  // black
                                bold: true,
                                fontSize: 10,
                                fontFamily: 'Arial'
                            },
                            horizontalAlignment: 'CENTER',
                            verticalAlignment: 'MIDDLE',
                            wrapStrategy: 'WRAP'
                        }
                    },
                    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)'
                }
            });

            // 2) Set header row height
            requests.push({
                updateDimensionProperties: {
                    range: {
                        sheetId: 0,
                        dimension: 'ROWS',
                        startIndex: 0,
                        endIndex: 1
                    },
                    properties: { pixelSize: 40 },
                    fields: 'pixelSize'
                }
            });

            // 3) Freeze header row
            requests.push({
                updateSheetProperties: {
                    properties: {
                        sheetId: 0,
                        gridProperties: { frozenRowCount: 1 }
                    },
                    fields: 'gridProperties.frozenRowCount'
                }
            });

            // 4) Set individual column widths
            for (let i = 0; i < columnWidths.length; i++) {
                requests.push({
                    updateDimensionProperties: {
                        range: {
                            sheetId: 0,
                            dimension: 'COLUMNS',
                            startIndex: i,
                            endIndex: i + 1
                        },
                        properties: { pixelSize: columnWidths[i] },
                        fields: 'pixelSize'
                    }
                });
            }

            // 5) Add thin borders to the header row
            requests.push({
                updateBorders: {
                    range: {
                        sheetId: 0,
                        startRowIndex: 0,
                        endRowIndex: 1,
                        startColumnIndex: 0,
                        endColumnIndex: 21  // A–U
                    },
                    top:    { style: 'SOLID', width: 1, color: { red: 0.122, green: 0.306, blue: 0.471 } },
                    bottom: { style: 'SOLID', width: 2, color: { red: 0.122, green: 0.306, blue: 0.471 } },
                    left:   { style: 'SOLID', width: 1, color: { red: 0.122, green: 0.306, blue: 0.471 } },
                    right:  { style: 'SOLID', width: 1, color: { red: 0.122, green: 0.306, blue: 0.471 } },
                    innerVertical: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.85, blue: 0.9 } }
                }
            });

            // 6) Set text wrap for Education column (T = index 19) - all data rows (1000 rows)
            requests.push({
                repeatCell: {
                    range: {
                        sheetId: 0,
                        startRowIndex: 1,       // skip header (already wrapped)
                        endRowIndex: 1000,       // cover up to 1000 rows
                        startColumnIndex: 19,    // T column (Education)
                        endColumnIndex: 20       // through T column
                    },
                    cell: {
                        userEnteredFormat: {
                            wrapStrategy: 'WRAP',
                            verticalAlignment: 'MIDDLE'
                        }
                    },
                    fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)'
                }
            });

            const formatResponse = await fetch(
                `${this.apiUrl}/${this.credentials.sheet_id}:batchUpdate`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ requests })
                }
            );

            if (!formatResponse.ok) {
                const errorText = await formatResponse.text();
                console.warn('[GoogleSheetsDB] Header formatting failed (non-fatal):', errorText);
            } else {
                console.log('[GoogleSheetsDB] Header styling & column widths applied');
            }
        } catch (error) {
            // Formatting failure is non-fatal – data was already written
            console.warn('[GoogleSheetsDB] Header formatting error (non-fatal):', error);
        }
    }

    /**
     * Apply borders and formatting to a newly added data row.
     * Called after each addCandidate() so borders expand automatically.
     * @param {string} token - OAuth token
     * @param {number} rowIndex - 1-based row number of the new data row
     */
    async applyRowFormatting(token, rowIndex) {
        try {
            // rowIndex is 1-based (rowCount = header + existing data rows)
            // The new row was appended at position rowIndex (0-based: rowIndex - 1)
            const startRow = rowIndex - 1;  // 0-based for API
            const endRow = rowIndex;

            const requests = [];

            // 1) Thin blue borders around every cell in this row
            requests.push({
                updateBorders: {
                    range: {
                        sheetId: 0,
                        startRowIndex: startRow,
                        endRowIndex: endRow,
                        startColumnIndex: 0,
                        endColumnIndex: 21  // A–U
                    },
                    top:    { style: 'SOLID', width: 1, color: { red: 0.75, green: 0.82, blue: 0.88 } },
                    bottom: { style: 'SOLID', width: 1, color: { red: 0.75, green: 0.82, blue: 0.88 } },
                    left:   { style: 'SOLID', width: 1, color: { red: 0.75, green: 0.82, blue: 0.88 } },
                    right:  { style: 'SOLID', width: 1, color: { red: 0.75, green: 0.82, blue: 0.88 } },
                    innerVertical: { style: 'SOLID', width: 1, color: { red: 0.85, green: 0.89, blue: 0.93 } }
                }
            });

            // 2) Alternate row shading: even rows get a light blue tint
            if (rowIndex % 2 === 0) {
                requests.push({
                    repeatCell: {
                        range: {
                            sheetId: 0,
                            startRowIndex: startRow,
                            endRowIndex: endRow,
                            startColumnIndex: 0,
                            endColumnIndex: 21
                        },
                        cell: {
                            userEnteredFormat: {
                                backgroundColor: { red: 0.93, green: 0.96, blue: 0.98 }  // light blue #EDF5FA
                            }
                        },
                        fields: 'userEnteredFormat.backgroundColor'
                    }
                });
            }

            // 3) Set data cell font, alignment, and vertical/horizontal-center for this row
            requests.push({
                repeatCell: {
                    range: {
                        sheetId: 0,
                        startRowIndex: startRow,
                        endRowIndex: endRow,
                        startColumnIndex: 0,
                        endColumnIndex: 21
                    },
                    cell: {
                        userEnteredFormat: {
                            textFormat: {
                                fontFamily: 'Arial',
                                fontSize: 10
                            },
                            horizontalAlignment: 'CENTER',
                            verticalAlignment: 'MIDDLE'
                        }
                    },
                    fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
                }
            });

            // 4) Linked In URL column (I = index 8): smaller font size 6
            requests.push({
                repeatCell: {
                    range: {
                        sheetId: 0,
                        startRowIndex: startRow,
                        endRowIndex: endRow,
                        startColumnIndex: 8,   // I: Linked In URL
                        endColumnIndex: 9
                    },
                    cell: {
                        userEnteredFormat: {
                            textFormat: {
                                fontFamily: 'Arial',
                                fontSize: 6
                            },
                            horizontalAlignment: 'CENTER',
                            verticalAlignment: 'MIDDLE'
                        }
                    },
                    fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
                }
            });

            // 5) Set data row height to 40px
            requests.push({
                updateDimensionProperties: {
                    range: {
                        sheetId: 0,
                        dimension: 'ROWS',
                        startIndex: startRow,
                        endIndex: endRow
                    },
                    properties: { pixelSize: 40 },
                    fields: 'pixelSize'
                }
            });

            const formatResponse = await fetch(
                `${this.apiUrl}/${this.credentials.sheet_id}:batchUpdate`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ requests })
                }
            );

            if (!formatResponse.ok) {
                console.warn('[GoogleSheetsDB] Row formatting failed (non-fatal)');
            } else {
                console.log('[GoogleSheetsDB] Row', rowIndex, 'formatted with borders');
            }
        } catch (error) {
            // Non-fatal – data was already written
            console.warn('[GoogleSheetsDB] Row formatting error (non-fatal):', error);
        }
    }

    /**
     * Get total row count (including header)
     */
    async getRowCount() {
        try {
            const token = await this.authenticate();
            const response = await fetch(
                `${this.apiUrl}/${this.credentials.sheet_id}/values/Sheet1!A:A`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!response.ok) return 0;
            const data = await response.json();
            return (data.values || []).length;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Find row index (1-based) by LinkedIn member ID.
     * Searches the LinkedIn URL column (I) for a URL containing the member ID.
     * Returns -1 if not found.
     */
    async findRowByMemberId(memberId) {
        try {
            const token = await this.authenticate();
            const response = await fetch(
                `${this.apiUrl}/${this.credentials.sheet_id}/values/Sheet1!I:I`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!response.ok) return -1;

            const data = await response.json();
            const values = data.values || [];
            const searchId = memberId.toLowerCase();

            for (let i = 1; i < values.length; i++) {
                const url = (values[i][0] || '').toLowerCase();
                if (url && (url.includes('/' + searchId + '/') || url.endsWith('/' + searchId))) {
                    return i + 1; // 1-based row number
                }
            }
            return -1;
        } catch (error) {
            return -1;
        }
    }

    /**
     * Check if candidate already exists in sheet
     * Searches LinkedIn URL column (I) for the member ID
     * Returns { exists: boolean, processedBy: string }
     */
    async candidateExists(linkedInId) {
        try {
            const token = await this.authenticate();
            const range = 'Sheet1!I:I'; // LinkedIn URL column

            const response = await fetch(
                `${this.apiUrl}/${this.credentials.sheet_id}/values/${range}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[GoogleSheetsDB] Failed to check candidate:', response.status, errorText);
                return { exists: false };
            }

            const data = await response.json();
            const values = data.values || [];
            const searchId = linkedInId.toLowerCase();

            // Skip header row, search for member ID in URL column (I)
            for (let i = 1; i < values.length; i++) {
                const url = (values[i][0] || '').toLowerCase();
                if (url && (url.includes('/' + searchId + '/') || url.endsWith('/' + searchId))) {
                    return { exists: true };
                }
            }
            return { exists: false };
        } catch (error) {
            console.error('[GoogleSheetsDB] Error checking candidate:', error);
            return { exists: false };
        }
    }

    /**
     * Add candidate to sheet (21-field schema A–U)
     * Ensures headers exist on first export, then appends data row.
     */
    async addCandidate(candidateData) {
        try {
            const token = await this.authenticate();

            // Ensure header row exists (only writes on first-time export)
            await this.ensureHeaders();

            // Calculate next serial number
            const rowCount = await this.getRowCount();
            const slNo = rowCount; // rowCount includes header, so first data row = 1

            // Format date as DD.MM.YY
            const now = new Date();
            const date = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getFullYear()).slice(-2)}`;



            const values = [[
                slNo,                                              // A: Sl.No
                date,                                              // B: Date
                candidateData.full_name || '',                     // C: Candidate Name
                candidateData.designation || '',                   // D: Designation
                candidateData.location || '',                      // E: Location
                candidateData.total_years_experience || '',        // F: Total Exp
                candidateData.current_company || '',               // G: Current Company
                '',                                                // H: Notes (manual)
                candidateData.profile_url || '',                   // I: Linked In URL
                '',                                                // J: Email (manual)
                '',                                                // K: Phone Number (manual)
                '',                                                // L: POOL Name (manual)
                '',                                                // M: Client Name (manual)
                '',                                                // N: Current Salary LPA (manual)
                '',                                                // O: Expected Salary LPA (manual)
                '',                                                // P: Notice Period Days (manual)
                '',                                                // Q: HR Name (manual)
                '',                                                // R: File Name (manual)
                candidateData.years_at_current || '',              // S: Years at Current Company
                candidateData.education || '',                     // T: Education
                candidateData.passout || ''                        // U: Passout Year
            ]];

            const response = await fetch(
                `${this.apiUrl}/${this.credentials.sheet_id}/values/Sheet1!A:U:append?valueInputOption=USER_ENTERED`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ values })
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to add candidate: ${response.status} - ${errorText}`);
            }

            console.log('[GoogleSheetsDB] Candidate added successfully:', candidateData.full_name);

            // Apply borders & formatting to the newly added row
            await this.applyRowFormatting(token, rowCount);

            return { success: true, data: candidateData };
        } catch (error) {
            console.error('[GoogleSheetsDB] Error adding candidate:', {
                error,
                sheetId: this.credentials?.sheet_id,
                hasToken: Boolean(this.accessToken),
                url: `${this.apiUrl}/${this.credentials?.sheet_id}/values/Sheet1!A:U:append`
            });
            return { success: false, error: error.message };
        }
    }

    /**
     * Get all candidates (21-field schema A–U)
     */
    async getAllCandidates() {
        try {
            const token = await this.authenticate();
            const range = 'Sheet1!A:U';

            const response = await fetch(
                `${this.apiUrl}/${this.credentials.sheet_id}/values/${range}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (!response.ok) {
                throw new Error(`Failed to fetch data: ${response.statusText}`);
            }

            const data = await response.json();
            const values = data.values || [];

            // Skip header row and convert to objects (21-field schema A–U)
            const candidates = values.slice(1).map((row, index) => ({
                id: index + 1,
                slNo: row[0] || '',              // A: Sl.No
                date: row[1] || '',              // B: Date
                fullName: row[2] || '',          // C: Candidate Name
                designation: row[3] || '',       // D: Designation
                location: row[4] || '',          // E: Location
                totalExp: row[5] || '',          // F: Total Exp
                company: row[6] || '',           // G: Current Company
                notes: row[7] || '',             // H: Notes
                profileUrl: row[8] || '',        // I: Linked In URL
                email: row[9] || '',             // J: Email
                phone: row[10] || '',            // K: Phone Number
                poolName: row[11] || '',         // L: POOL Name
                clientName: row[12] || '',       // M: Client Name
                currentSalary: row[13] || '',    // N: Current Salary LPA
                expectedSalary: row[14] || '',   // O: Expected Salary LPA
                noticePeriod: row[15] || '',     // P: Notice Period Days
                hrName: row[16] || '',           // Q: HR Name
                fileName: row[17] || '',         // R: File Name
                yearsAtCurrent: row[18] || '',   // S: Years at Current Company
                education: row[19] || '',        // T: Education
                passoutYear: row[20] || ''       // U: Passout Year
            }));

            console.log('[GoogleSheetsDB] Retrieved', candidates.length, 'candidates');
            return candidates;
        } catch (error) {
            console.error('[GoogleSheetsDB] Error fetching candidates:', error);
            throw error;
        }
    }

    /**
     * Get candidate count
     */
    async getCandidateCount() {
        try {
            const candidates = await this.getAllCandidates();
            return candidates.length;
        } catch (error) {
            console.error('[GoogleSheetsDB] Error getting count:', error);
            return 0;
        }
    }

    /**
     * Update candidate notes (column H)
     */
    async updateCandidateNotes(linkedInId, notes) {
        try {
            const token = await this.authenticate();
            const rowIndex = await this.findRowByMemberId(linkedInId);

            if (rowIndex < 2) {
                throw new Error('Candidate not found');
            }

            const response = await fetch(
                `${this.apiUrl}/${this.credentials.sheet_id}/values/Sheet1!H${rowIndex}?valueInputOption=USER_ENTERED`,
                {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ values: [[notes]] })
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to update candidate: ${response.statusText}`);
            }

            console.log('[GoogleSheetsDB] Candidate notes updated');
            return true;
        } catch (error) {
            console.error('[GoogleSheetsDB] Error updating candidate:', error);
            throw error;
        }
    }

    /**
     * Update candidate fields (21-field schema)
     * G = Current Company, H = Notes, S = Years at Current Company
     */
    async updateCandidateFields(linkedInId, { company, notes, yearsAtCurrent }) {
        try {
            const token = await this.authenticate();
            const rowIndex = await this.findRowByMemberId(linkedInId);

            if (rowIndex < 2) throw new Error('Candidate not found');

            const updates = [];

            // Column G = Current Company
            if (typeof company === 'string') {
                updates.push(fetch(
                    `${this.apiUrl}/${this.credentials.sheet_id}/values/Sheet1!G${rowIndex}?valueInputOption=USER_ENTERED`,
                    {
                        method: 'PUT',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ values: [[company]] })
                    }
                ));
            }

            // Column H = Notes
            if (typeof notes === 'string') {
                updates.push(fetch(
                    `${this.apiUrl}/${this.credentials.sheet_id}/values/Sheet1!H${rowIndex}?valueInputOption=USER_ENTERED`,
                    {
                        method: 'PUT',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ values: [[notes]] })
                    }
                ));
            }

            // Column S = Years at Current Company
            if (typeof yearsAtCurrent === 'string') {
                updates.push(fetch(
                    `${this.apiUrl}/${this.credentials.sheet_id}/values/Sheet1!S${rowIndex}?valueInputOption=USER_ENTERED`,
                    {
                        method: 'PUT',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ values: [[yearsAtCurrent]] })
                    }
                ));
            }

            const results = await Promise.all(updates);
            const failed = results.find(r => !r.ok);
            if (failed) {
                const text = await failed.text();
                throw new Error(`Failed to update: ${failed.status} - ${text}`);
            }
            return { success: true };
        } catch (error) {
            console.error('[GoogleSheetsDB] Error updating fields:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete candidate (finds by LinkedIn URL match)
     */
    async deleteCandidate(linkedInId) {
        try {
            const token = await this.authenticate();
            const rowIndex = await this.findRowByMemberId(linkedInId);

            if (rowIndex < 2) {
                throw new Error('Candidate not found');
            }

            // rowIndex is 1-based; batchUpdate uses 0-based
            const response = await fetch(
                `${this.apiUrl}/${this.credentials.sheet_id}:batchUpdate`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        requests: [{
                            deleteDimension: {
                                range: {
                                    sheetId: 0,
                                    dimension: 'ROWS',
                                    startIndex: rowIndex - 1,
                                    endIndex: rowIndex
                                }
                            }
                        }]
                    })
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to delete candidate: ${response.statusText}`);
            }

            console.log('[GoogleSheetsDB] Candidate deleted');
            return true;
        } catch (error) {
            console.error('[GoogleSheetsDB] Error deleting candidate:', error);
            throw error;
        }
    }

    /**
     * Test connection
     */
    async testConnection() {
        try {
            await this.authenticate();
            const count = await this.getCandidateCount();
            console.log('[GoogleSheetsDB] Connection test successful. Candidates:', count);
            return { success: true, count };
        } catch (error) {
            console.error('[GoogleSheetsDB] Connection test failed:', error);
            return { success: false, error: error.message };
        }
    }
}

// Create global instance
const googleSheetsDB = new GoogleSheetsDB();

