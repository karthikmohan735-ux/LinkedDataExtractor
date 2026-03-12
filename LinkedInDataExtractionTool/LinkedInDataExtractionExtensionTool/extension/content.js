/**
 * LinkedIn Recruiter - Candidate Tracker Content Script (Google Sheets Version)
 * This script runs on LinkedIn Recruiter pages to track candidates using Google Sheets
 */

// Prevent script from running multiple times
if (typeof window.linkedInTrackerInitialized !== 'undefined') {
    console.log('[LinkedIn Tracker] Already initialized, skipping...');
} else {
    window.linkedInTrackerInitialized = true;

let currentMemberId = null;
let processingInProgress = false;
let googleSheetsDB = null;
let lastProcessTime = 0;
const MIN_PROCESS_INTERVAL = 2500; // Minimum 2.5 seconds between processing attempts

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

// Block malformed XHR requests
const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url, ...args) {
    if (!url || typeof url !== 'string' || url === '/' || url === '' || url.includes('/invalid') || 
        url.includes('gf1jbqula7hip12fm2vbpbanv') || !url.startsWith('http')) {
        this._blockedRequest = true;
        return;
    }
    return originalOpen.apply(this, [method, url, ...args]);
};

const originalXHRSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function(...args) {
    if (this._blockedRequest) {
        throw new Error('Request blocked');
    }
    return originalXHRSend.apply(this, args);
};

// Debug logging
const debug = (message, data = null) => {
    console.log(`[LinkedIn Tracker] ${message}`, data || '');
};

/**
 * Initialize the Google Sheets DB
 */
async function initializeGoogleSheetsDB() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(['googleSheetsConfig'], (result) => {
            if (result.googleSheetsConfig) {
                googleSheetsDB = new GoogleSheetsDB();
                googleSheetsDB.credentials = result.googleSheetsConfig;
                debug('Google Sheets DB initialized');
                resolve(true);
            } else {
                debug('⚠️ Google Sheets not configured');
                googleSheetsDB = null;
                resolve(false);
            }
        });
    });
}

/**
 * Extract LinkedIn Member ID from various URL patterns
 */
function extractMemberId() {
    try {
        const url = window.location.href;
        debug('Current URL:', url);

        const profileIdParam = new URL(url).searchParams.get('profileId');
        if (profileIdParam) {
            return profileIdParam;
        }

        const talentMatch = url.match(/linkedin\.com\/talent\/profile\/([^/?]+)/i);
        if (talentMatch && talentMatch[1]) {
            return talentMatch[1];
        }

        const hireMatch = url.match(/linkedin\.com\/recruiter\/profile\/([^/?]+)/i);
        if (hireMatch && hireMatch[1]) {
            return hireMatch[1];
        }

        const profileMatch = url.match(/linkedin\.com\/in\/([^/?]+)/i);
        if (profileMatch && profileMatch[1]) {
            return profileMatch[1];
        }

        const profileElement = document.querySelector('[data-member-id]');
        if (profileElement) {
            return profileElement.getAttribute('data-member-id');
        }

        debug('⚠️ Could not extract member ID from URL');
        return null;
    } catch (error) {
        console.error('Error extracting member ID:', error);
        return null;
    }
}

/**
 * Extract candidate profile data from LinkedIn page
 */
function extractProfileData(memberId) {
    try {
        const getMeta = (prop) => document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') || '';

        const nameSelectors = [
            'h1.text-heading-xlarge',
            'div.pv-text-details__left-panel h1',
            'h1.profile-topcard__name',
            'h1.t-24',
            '.artdeco-entity-lockup__title',
            '[data-test-profile-name]',
            '.ph5 h1',
            // Details page: name in the profile card header
            '.pv-top-card h1',
            '.scaffold-layout__detail h1',
            '.artdeco-card h1',
            // Details page: header with back arrow contains the name
            '.scaffold-layout__detail .artdeco-entity-lockup__title span',
            '.pv-profile-card__anchor span.t-bold',
            // The back button area often has the name
            '.scaffold-layout__detail header h1',
            '[class*="profile-card"] h3'
        ];

        let fullName = '';
        for (const selector of nameSelectors) {
            const el = document.querySelector(selector);
            if (el && el.textContent) {
                const text = el.textContent.trim();
                // Skip if it looks like a company name or generic text
                if (text && !/(linkedin|experience|education|skills|company)/i.test(text)) {
                    fullName = text;
                    break;
                }
            }
        }
        
        // Details page: try to get name from the profile link in header
        if (!fullName) {
            const profileLink = document.querySelector('a[href*="/in/"] span.t-bold, .scaffold-layout__detail a span.t-bold');
            if (profileLink && profileLink.textContent) {
                fullName = profileLink.textContent.trim();
            }
        }

        // Fallback: extract from meta title, but clean it properly
        if (!fullName) {
            const ogTitle = getMeta('og:title') || '';
            const pageTitle = document.title || '';
            
            // Try og:title first (usually cleaner)
            let titleMatch = ogTitle.match(/^([^|–\-]+)/);
            if (titleMatch) {
                const extracted = titleMatch[1].trim();
                // Skip if it's a LinkedIn tab title
                if (!/(^\(\d+\)\s*)?linkedin$/i.test(extracted)) {
                    fullName = extracted;
                }
            }
            
            // If og:title failed, try page title but exclude LinkedIn patterns
            if (!fullName || fullName.toLowerCase().includes('linkedin')) {
                titleMatch = pageTitle.match(/^([^|–\-]+)/);
                if (titleMatch) {
                    const extracted = titleMatch[1].trim();
                    // Skip if it looks like a LinkedIn title "(3) LinkedIn" or just "LinkedIn"
                    if (!/(^\(\d+\)\s*)?linkedin$/i.test(extracted) && !extracted.toLowerCase().includes('linkedin')) {
                        fullName = extracted;
                    }
                }
            }
            
            if (!fullName) fullName = 'Unknown Candidate';
        }
        
        debug('Extracted name:', fullName);

        const locationSelectors = [
            'span.text-body-small.inline.t-black--light.break-words',
            '.pv-text-details__left-panel .text-body-small:not(.break-words)',
            '[data-test-profile-location]',
            // Additional selectors for different page layouts
            '.pv-top-card .text-body-small',
            '.artdeco-entity-lockup__caption'
        ];
        let location = '';
        for (const selector of locationSelectors) {
            const el = document.querySelector(selector);
            if (el && el.textContent) {
                const text = el.textContent.trim();
                if (text && text.length > 2 && !text.includes('·') && !text.includes('follower') && !text.includes('connection')) {
                    location = text;
                    break;
                }
            }
        }

        const currentCompany = extractCurrentCompany();

        // Try to extract latest experience (designation + company) from Experience section
        const exp = extractLatestExperience();

        // Try to extract latest education and passout year from Education section
        const edu = extractLatestEducation();

        // Get clean profile URL (remove /details/experience or other sub-pages)
        let profileUrl = window.location.href.split('?')[0];
        // If we're on a details sub-page, extract the main profile URL
        const detailsMatch = profileUrl.match(/(https?:\/\/[^/]+\/in\/[^/]+)/);
        if (detailsMatch) {
            profileUrl = detailsMatch[1] + '/';
        }
        
        const profileData = {
            member_id: memberId,
            full_name: fullName || 'Unknown',
            // Designation from Experience section (job title)
            designation: exp.title || '',
            location: location || '',
            // Current company name from Experience section
            current_company: exp.company || currentCompany || '',
            passout: edu.passout || '',
            qualification: edu.qualification || '',
            education: formatDegreeAbbreviation(edu.qualification) || '',
            profile_url: profileUrl,
            // Years of experience
            years_at_current: exp.yearsAtCurrent || '',
            total_years_experience: exp.totalYears || ''
        };

        debug('Extracted profile data:', profileData);
        return profileData;
    } catch (error) {
        console.error('Error extracting profile data:', error);
        return null;
    }
}

/**
 * Extract latest experience item (designation + company) from Experience section
 */
function extractLatestExperience() {
    try {
        let section = null;
        const url = window.location.href;
        
        // Check if we're on the experience details page
        const isDetailsPage = url.includes('/details/experience');
        
        if (isDetailsPage) {
            // On details page, the main content area IS the experience section
            section = document.querySelector('.scaffold-layout__main, main, .pvs-list__container');
            if (!section) {
                section = document.querySelector('[class*="scaffold"]') || document.body;
            }
            debug('On experience details page, using main content as section');
        } else {
            // On main profile page, find the Experience section
            const anchor = document.querySelector('#experience');
            section = anchor ? anchor.closest('section') : null;
            if (!section) {
                // Fallback: find a section that contains the word "Experience"
                section = Array.from(document.querySelectorAll('section')).find(sec => {
                    const header = sec.querySelector('h2, .pvs-header__title');
                    return header && /experience/i.test(header.textContent || '');
                }) || null;
            }
        }
        
        if (!section) {
            debug('Could not find experience section');
            return { title: '', company: '', yearsAtCurrent: '', totalYears: '' };
        }

        // Find first experience entity - try multiple selectors for different page layouts
        let entity = section.querySelector('[data-view-name="profile-component-entity"]');
        if (!entity) {
            entity = section.querySelector('.pvs-list__paged-list-item .pvs-entity');
        }
        if (!entity) {
            entity = section.querySelector('li.artdeco-list__item');
        }
        if (!entity) {
            entity = section.querySelector('.pvs-entity');
        }
        if (!entity) {
            // On details page, the first list item with experience data
            entity = section.querySelector('.pvs-list > li, ul > li.pvs-list__item--line-separated');
        }
        
        if (!entity) {
            debug('Could not find any experience entity');
            return { title: '', company: '', yearsAtCurrent: '', totalYears: '' };
        }
        
        debug('Found experience entity:', entity.innerText?.substring(0, 100));

        // Detect multi-role entry (grouped roles under one company)
        // In multi-role, the top-level entity title = company name, roles are nested inside
        const nestedRoles = entity.querySelectorAll(
            '.pvs-entity__sub-components [data-view-name="profile-component-entity"],' +
            '.pvs-entity__sub-components li.pvs-list__paged-list-item,' +
            '.pvs-entity__sub-components li.artdeco-list__item,' +
            '.pvs-entity__sub-components .pvs-entity'
        );
        const isMultiRole = nestedRoles.length > 0;
        debug('Is multi-role entry:', isMultiRole, '| Nested roles found:', nestedRoles.length);

        let title = '';
        let company = '';

        if (isMultiRole) {
            // MULTI-ROLE: company name is the top-level title, role title is in nested items
            // Get company from the top-level entity's bold title
            const topTitle = entity.querySelector(':scope > a .t-bold span[aria-hidden="true"],' +
                ':scope > div > a .t-bold span[aria-hidden="true"],' +
                '.pvs-entity__title span[aria-hidden="true"]');
            company = topTitle?.innerText?.trim() || '';
            debug('Multi-role company from top title:', company);

            // Fallback: try company link
            if (!company) {
                const companyLink = entity.querySelector('a[href*="company"] .t-bold span[aria-hidden="true"]');
                company = companyLink?.innerText?.trim() || '';
            }

            // Get title from the FIRST (latest/current) nested role
            const firstRole = nestedRoles[0];
            if (firstRole) {
                // Try specific role title selectors within the nested role
                const roleTitleEl = firstRole.querySelector(
                    '.t-bold span[aria-hidden="true"],' +
                    '.pvs-entity__title span[aria-hidden="true"],' +
                    'span.mr1.hoverable-link-text.t-bold span[aria-hidden="true"],' +
                    'div.t-bold span[aria-hidden="true"]'
                );
                if (roleTitleEl) {
                    const roleText = roleTitleEl.innerText?.trim() || '';
                    // Make sure it's not the company name again
                    if (roleText && roleText.toLowerCase() !== company.toLowerCase()) {
                        title = roleText;
                    }
                }
                debug('Multi-role extracted title:', title);
            }
        } else {
            // SINGLE-ROLE: use existing dedicated helpers
            title = extractTitleFromEntity(entity);
            company = extractCompanyFromEntity(entity);
        }

        // Fallback company to current company section on page
        if (!company) company = extractCurrentCompany();

        debug('Final extraction - Title:', title, '| Company:', company);

        // Extract years at current company (from first/current role, not company total)
        const yearsAtCurrent = extractCurrentRoleDuration(entity);
        
        // Calculate total years of experience from all positions
        const totalYears = calculateTotalExperience(section);
        console.log('[extractLatestExperience] totalYears calculated:', totalYears);

        return { title, company, yearsAtCurrent, totalYears };
    } catch (_) {
        return { title: '', company: '', yearsAtCurrent: '', totalYears: '' };
    }
}

/**
 * Extract designation/title robustly from an experience entity
 * NOTE: This is used for SINGLE-ROLE entries only.
 * Multi-role entries are handled directly in extractLatestExperience().
 */
function extractTitleFromEntity(entity) {
    try {
        const EMPLOYMENT_TYPES = /full[- ]?time|part[- ]?time|self[- ]?employed|contract|internship|intern|apprentice|trainee/i;
        const DURATION = /(\d+\s*(?:yr|yrs|year|years|mo|mos|month|months))/i;
        const isLikelyCompany = /private limited|pvt|inc\.?|llc|llp|ltd/i;

        const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();
        const isValidTitle = (text, companyHint = '') => {
            const cleaned = clean(text);
            if (!cleaned) return false;
            if (EMPLOYMENT_TYPES.test(cleaned) || DURATION.test(cleaned)) return false;
            if (isLikelyCompany.test(cleaned)) return false;
            if (companyHint && cleaned.toLowerCase() === clean(companyHint).toLowerCase()) return false;
            return true;
        };

        const companyHint = extractCompanyFromEntity(entity);

        // 1) Look for title in pvs-entity__title (use aria-hidden span to avoid duplication)
        const titleEl = entity.querySelector('.pvs-entity__title span[aria-hidden="true"]');
        if (isValidTitle(titleEl?.innerText, companyHint)) return clean(titleEl.innerText);

        // 2) Role title inside position group role item (multi-role experiences)
        const roleTitle = entity.querySelector('.pvs-entity__position-group-role-item__title span[aria-hidden="true"]');
        if (isValidTitle(roleTitle?.innerText, companyHint)) return clean(roleTitle.innerText);

        // 3) Try bold text at top of entity — BUT use span[aria-hidden="true"] to avoid
        //    reading both visible + visually-hidden spans (which causes "Cognizant Cognizant")
        const boldSpan = entity.querySelector('.t-bold span[aria-hidden="true"]');
        if (isValidTitle(boldSpan?.innerText, companyHint)) return clean(boldSpan.innerText);

        // 4) Try first h3/h4 heading
        const heading = entity.querySelector('h3, h4')?.innerText;
        if (isValidTitle(heading, companyHint)) return clean(heading);

        // 5) Fallback: parse visible lines and pick the first that looks like a role (not company)
        const textLineTitle = extractTitleFromLines(entity, companyHint, { EMPLOYMENT_TYPES, DURATION });
        if (textLineTitle) return textLineTitle;

        return '';
    } catch (_) {
        return '';
    }
}

// Fallback helper to pick a plausible title from innerText lines
function extractTitleFromLines(entity, companyHint = '', patterns = {}) {
    const { EMPLOYMENT_TYPES = /full[- ]?time|part[- ]?time|self[- ]?employed|contract|internship|intern|apprentice|trainee/i, DURATION = /(\d+\s*(?:yr|yrs|year|years|mo|mos|month|months))/i } = patterns;
    const BAD_WORDS = /present|location|remote|hybrid|on-site|onsite/i;

    const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();
    const normCompany = clean(companyHint).toLowerCase();

    const lines = (entity.innerText || '')
        .split('\n')
        .map(clean)
        .filter(Boolean);

    for (const line of lines) {
        const lower = line.toLowerCase();
        if (normCompany && lower === normCompany) continue;
        if (EMPLOYMENT_TYPES.test(line) || DURATION.test(line) || BAD_WORDS.test(line)) continue;
        // Skip date-like or duration-like strings
        if (/\b\d{4}\b/.test(line) || /present/i.test(line)) continue;
        // Likely a role if it contains verbs or seniority keywords
        if (/(engineer|manager|lead|director|architect|developer|designer|analyst|consultant|specialist|head|officer)/i.test(line)) return line;
        // Otherwise, pick the first acceptable non-company text
        if (!/company|education/i.test(line)) return line;
    }

    return '';
}

/**
 * Extract company name robustly from an experience entity
 * Avoids picking employment type (e.g., "Full-time")
 */
function extractCompanyFromEntity(entity) {
    try {
        const EMPLOYMENT_TYPES = /full[- ]?time|part[- ]?time|self[- ]?employed|contract|internship|freelance|temporary|apprenticeship|trainee/i;
        const SKIP_WORDS = /^(at|location)$/i;
        const JOB_TITLE_KEYWORDS = /engineer|manager|lead|director|architect|developer|designer|analyst|consultant|specialist|head|officer|coordinator|administrator|executive|assistant/i;
        const DURATION = /\d+\s*(yr|yrs|mo|mos|month|months|year|years)/i;
        const DATE_LIKE = /present|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4}/i;
        const LOCATION_WORDS = /remote|hybrid|on-site|onsite|bengaluru|bangalore|mumbai|delhi|pune|hyderabad|chennai|india/i;

        // Helper: validate a candidate company string
        const isValidCompany = (text) => {
            if (!text || text.length < 2) return false;
            if (EMPLOYMENT_TYPES.test(text)) return false;
            if (DURATION.test(text)) return false;
            if (DATE_LIKE.test(text)) return false;
            if (SKIP_WORDS.test(text)) return false;
            if (LOCATION_WORDS.test(text)) return false;
            return true;
        };

        // Helper: split "Company · Employment-Type" and extract company part
        const extractFromBulletLine = (text) => {
            if (!text) return '';
            const parts = text.split(/\s*[·•]\s*/);
            const candidate = parts[0].trim();
            // Last bullet part should hint at employment type to confirm this is a "Company · Role" line
            if (parts.length >= 2 && EMPLOYMENT_TYPES.test(parts[parts.length - 1])) {
                return isValidCompany(candidate) && !JOB_TITLE_KEYWORDS.test(candidate) ? candidate : '';
            }
            return '';
        };

        // Get the title text (bold) to avoid mistaking it for the company
        const titleText = (entity.querySelector('.t-bold span[aria-hidden="true"]')?.innerText || '').trim().toLowerCase();

        // ── PASS 1: Company link in pvs-entity__subtitle (most reliable) ──
        const companyLinkInSub = entity.querySelector('.pvs-entity__subtitle a[href*="company"] span[aria-hidden="true"]');
        if (companyLinkInSub) {
            const text = companyLinkInSub.innerText?.trim();
            if (isValidCompany(text) && !SKIP_WORDS.test(text)) {
                console.log('[extractCompanyFromEntity] Found via company link:', text);
                return text;
            }
        }

        // Also try company link anywhere in entity (for Type 3 where there may be no pvs-entity__subtitle)
        const companyLinkAny = entity.querySelector('a[href*="/company/"] span[aria-hidden="true"], a[href*="company"] span[aria-hidden="true"]');
        if (companyLinkAny) {
            const text = companyLinkAny.innerText?.trim();
            if (isValidCompany(text) && !JOB_TITLE_KEYWORDS.test(text) && text.toLowerCase() !== titleText) {
                console.log('[extractCompanyFromEntity] Found via company link (any):', text);
                return text;
            }
        }

        // ── PASS 2: pvs-entity__subtitle spans ──
        const sub = entity.querySelector('.pvs-entity__subtitle');
        if (sub) {
            const spans = Array.from(sub.querySelectorAll('span[aria-hidden="true"]'))
                .map(s => s.innerText?.trim())
                .filter(t => t && t.length > 1);

            console.log('[extractCompanyFromEntity] All subtitle spans:', spans);

            for (const span of spans) {
                // Try "Company · Full-time" combined pattern first
                const fromBullet = extractFromBulletLine(span);
                if (fromBullet && fromBullet.toLowerCase() !== titleText) {
                    console.log('[extractCompanyFromEntity] Found via subtitle bullet split:', fromBullet);
                    return fromBullet;
                }
                // Otherwise validate as standalone company
                if (isValidCompany(span) && !JOB_TITLE_KEYWORDS.test(span) && span.toLowerCase() !== titleText) {
                    console.log('[extractCompanyFromEntity] Found via subtitle span:', span);
                    return span;
                }
            }

            // Fallback: split subtitle innerText by bullets
            const subParts = (sub.innerText?.trim() || '').split(/[•·]/).map(p => p.trim()).filter(Boolean);
            for (const part of subParts) {
                if (isValidCompany(part) && !JOB_TITLE_KEYWORDS.test(part) && part.toLowerCase() !== titleText) {
                    console.log('[extractCompanyFromEntity] Found via subtitle text split:', part);
                    return part;
                }
            }
        }

        // ── PASS 1b: Company logo link → sibling content div (most reliable for Type 3) ──
        // Structure: entity > div.flex-row > [logo a[data-field="experience_company_logo"]] + [content div]
        // The content div directly after the logo anchor contains ONLY title, company, dates.
        // It NEVER contains skill tags (those are in a separate sub-components div further below).
        const logoLink = entity.querySelector('a[data-field="experience_company_logo"]');
        if (logoLink) {
            // The content div is the next sibling of the logo link (or of the logo link's parent)
            const rowDiv = logoLink.parentElement;
            // Try direct next sibling of logo link first, then next sibling of the row
            const contentDiv = logoLink.nextElementSibling || (rowDiv && rowDiv.nextElementSibling);
            if (contentDiv) {
                // Look for "Company · Full-time" pattern in t-14 t-normal within this content area only
                const contentSpans = Array.from(
                    contentDiv.querySelectorAll('span.t-14.t-normal:not(.t-black--light) span[aria-hidden="true"]')
                ).map(s => s.innerText?.trim()).filter(Boolean);
                console.log('[extractCompanyFromEntity] Logo-sibling content spans:', contentSpans);
                for (const text of contentSpans) {
                    const fromBullet = extractFromBulletLine(text);
                    if (fromBullet && fromBullet.toLowerCase() !== titleText) {
                        console.log('[extractCompanyFromEntity] Found via logo-sibling bullet split:', fromBullet);
                        return fromBullet;
                    }
                }
                // Standalone (no bullet) company inside the scoped content div
                for (const text of contentSpans) {
                    if (isValidCompany(text) && !JOB_TITLE_KEYWORDS.test(text) && text.toLowerCase() !== titleText) {
                        console.log('[extractCompanyFromEntity] Found via logo-sibling span:', text);
                        return text;
                    }
                }
            }
        }

        // ── PASS 3: t-14 t-normal spans (Type 3 layout – no pvs-entity__subtitle class) ──
        // LinkedIn /in/ profiles sometimes skip pvs-entity__subtitle and use plain span.t-14.t-normal.
        // IMPORTANT: exclude spans inside sub-components (nested roles, skill tags, extra-info),
        // because skill labels like "STAAD Pro and RCDC" also use span.t-14.t-normal.
        const normalSpans = Array.from(
            entity.querySelectorAll('span.t-14.t-normal:not(.t-black--light) span[aria-hidden="true"]')
        ).filter(el =>
            // Reject any span that lives inside a sub-component, skill, or extra-info container
            !el.closest(
                '.pvs-entity__sub-components, ' +
                '.pvs-entity__extra-info, ' +
                '[data-field*="skill"], ' +
                '[class*="extra-info"], ' +
                '[class*="top-skills"]'
            )
        ).map(s => s.innerText?.trim()).filter(Boolean);

        console.log('[extractCompanyFromEntity] t-14 t-normal spans (Type-3 fallback):', normalSpans);

        // Priority 1 within Pass 3: strong "Company · Full-time" bullet pattern (unambiguous)
        for (const text of normalSpans) {
            const fromBullet = extractFromBulletLine(text);
            if (fromBullet && fromBullet.toLowerCase() !== titleText) {
                console.log('[extractCompanyFromEntity] Found via t-14 bullet split:', fromBullet);
                return fromBullet;
            }
        }

        // Priority 2 within Pass 3: standalone valid company span
        for (const text of normalSpans) {
            if (text.toLowerCase() === titleText) continue;
            if (isValidCompany(text) && !JOB_TITLE_KEYWORDS.test(text)) {
                console.log('[extractCompanyFromEntity] Found via t-14 span:', text);
                return text;
            }
        }

        // ── PASS 4: innerText line parsing (last resort) ──
        // Walk entity lines; company typically follows the title line and precedes the duration line
        const entityLines = (entity.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);
        let pastTitle = false;
        for (const line of entityLines) {
            if (line.toLowerCase() === titleText) { pastTitle = true; continue; }
            if (!pastTitle) continue;
            // Once past title, skip duration / date / location
            if (DURATION.test(line) || DATE_LIKE.test(line) || LOCATION_WORDS.test(line)) continue;
            if (EMPLOYMENT_TYPES.test(line)) continue;
            // "Company · Full-time" combined line
            const fromBullet = extractFromBulletLine(line);
            if (fromBullet) {
                console.log('[extractCompanyFromEntity] Found via innerText bullet split:', fromBullet);
                return fromBullet;
            }
            // Standalone line
            if (isValidCompany(line) && !JOB_TITLE_KEYWORDS.test(line)) {
                console.log('[extractCompanyFromEntity] Found via innerText line:', line);
                return line;
            }
        }

        console.log('[extractCompanyFromEntity] No company found');
        return '';
    } catch (e) {
        console.error('[extractCompanyFromEntity] Error:', e);
        return '';
    }
}

/**
 * Extract duration from a single experience entity
 */
function extractDurationFromEntity(entity) {
    try {
        // Look for duration text in caption wrapper (e.g., "Sep 2025 - Present · 5 mos")
        const captionWrappers = entity.querySelectorAll('.pvs-entity__caption-wrapper, span.t-14.t-normal.t-black--light span[aria-hidden="true"]');
        
        for (const wrapper of captionWrappers) {
            const text = wrapper.innerText?.trim() || '';
            
            // Match patterns like "5 mos", "2 yrs", "1 yr 3 mos", "2 yrs 6 mos"
            // More flexible regex to catch variations
            const yearsMatch = text.match(/(\d+)\s*y(?:ears?|rs?)/i);
            const monthsMatch = text.match(/(\d+)\s*m(?:onths?|os?)/i);
            
            if (yearsMatch || monthsMatch) {
                const years = yearsMatch ? parseInt(yearsMatch[1], 10) : 0;
                const months = monthsMatch ? parseInt(monthsMatch[1], 10) : 0;
                return formatDuration(years, months);
            }
        }
        
        // Fallback: check innerText lines for duration pattern
        const lines = (entity.innerText || '').split('\n').map(t => t.trim());
        for (const line of lines) {
            const yearsMatch = line.match(/(\d+)\s*y(?:ears?|rs?)/i);
            const monthsMatch = line.match(/(\d+)\s*m(?:onths?|os?)/i);
            
            if (yearsMatch || monthsMatch) {
                const years = yearsMatch ? parseInt(yearsMatch[1], 10) : 0;
                const months = monthsMatch ? parseInt(monthsMatch[1], 10) : 0;
                return formatDuration(years, months);
            }
        }
        
        return '';
    } catch (_) {
        return '';
    }
}

/**
 * Extract duration from the current role (not company total)
 * For multi-role companies, finds the first role with "Present"
 */
function extractCurrentRoleDuration(entity) {
    try {
        const allText = entity.innerText || '';
        
        // Check if this is a multi-role entry (has nested roles)
        const nestedRoles = entity.querySelectorAll('.pvs-entity__sub-components .pvs-entity, .pvs-list__paged-list-item .pvs-entity');
        
        if (nestedRoles.length > 0) {
            // Multi-role company: find the role with "Present"
            for (const role of nestedRoles) {
                const roleText = role.innerText || '';
                if (/present/i.test(roleText)) {
                    // Extract duration from this current role
                    return extractDurationFromEntity(role);
                }
            }
            // Fallback: return first role's duration
            return extractDurationFromEntity(nestedRoles[0]);
        } else {
            // Single role: extract duration normally
            return extractDurationFromEntity(entity);
        }
    } catch (_) {
        return '';
    }
}

/**
 * Calculate total years of experience from all experience entries
 */
function calculateTotalExperience(section) {
    try {
        let totalMonths = 0;
        const processedDurations = new Set(); // Track what we've already counted
        
        // Find all top-level list items in the experience section
        // Try multiple selectors for different page layouts
        let topLevelItems = section.querySelectorAll(':scope > div > ul > li.artdeco-list__item');
        
        // Fallback selectors for different page structures
        if (topLevelItems.length === 0) {
            topLevelItems = section.querySelectorAll('.pvs-list__paged-list-item');
        }
        if (topLevelItems.length === 0) {
            topLevelItems = section.querySelectorAll('li.artdeco-list__item');
        }
        if (topLevelItems.length === 0) {
            // Experience details page: each experience is a list item
            topLevelItems = section.querySelectorAll('.pvs-list > li, ul > li.pvs-list__item--line-separated');
        }
        
        console.log('[calculateTotalExperience] Found', topLevelItems.length, 'top-level items');
        
        for (const item of topLevelItems) {
            // Look for the FIRST duration text in this top-level item
            // This will be the company-level duration for multi-role entries
            // or the single role duration for single-role entries
            const allText = item.innerText || '';
            
            // Skip internships and part-time jobs
            // Only skip if it's explicitly marked as internship employment type, not just because title contains "trainee"
            const isInternship = /\b(internship)\s*[·•\-]|\bemployment type:\s*internship/i.test(allText) ||
                                 /\bintern\s*[·•\-]/i.test(allText); // "Intern · 2 mos" pattern
            const isPartTime = /\bpart[- ]?time\s*[·•\-]/i.test(allText);
            
            if (isInternship || isPartTime) {
                console.log('[calculateTotalExperience] Skipping internship/part-time:', allText.substring(0, 50));
                continue; // Skip this entry
            }
            
            // Find the first occurrence of duration pattern
            const durationPattern = /(\d+)\s*y(?:ears?|rs?)?\s*(?:(\d+)\s*m(?:onths?|os?)?)?|(\d+)\s*m(?:onths?|os?)/i;
            const match = allText.match(durationPattern);
            
            if (match) {
                let years = 0;
                let months = 0;
                
                if (match[1]) {
                    // Pattern like "2 yrs 8 mos" or "2 yrs"
                    years = parseInt(match[1], 10);
                    months = match[2] ? parseInt(match[2], 10) : 0;
                } else if (match[3]) {
                    // Pattern like "8 mos" only
                    months = parseInt(match[3], 10);
                }
                
                // Create a unique identifier for this duration to avoid duplicates
                const durationKey = `${years}-${months}`;
                const position = allText.indexOf(match[0]);
                const uniqueKey = `${durationKey}-${position}`;
                
                if (!processedDurations.has(uniqueKey)) {
                    totalMonths += (years * 12) + months;
                    processedDurations.add(uniqueKey);
                    console.log('[calculateTotalExperience] Added:', years, 'yrs', months, 'mos. Total:', totalMonths, 'months');
                }
            }
        }
        
        console.log('[calculateTotalExperience] Final totalMonths:', totalMonths);
        
        if (totalMonths === 0) return '';
        
        const totalYears = Math.floor(totalMonths / 12);
        const remainingMonths = totalMonths % 12;
        const result = formatDuration(totalYears, remainingMonths);
        console.log('[calculateTotalExperience] Returning:', result);
        return result;
    } catch (e) {
        console.error('Error calculating total experience:', e);
        return '';
    }
}

/**
 * Format duration as "X yrs Y mos" or "X yrs" or "Y mos"
 */
function formatDuration(years, months) {
    if (years > 0 && months > 0) {
        return `${years} yr${years > 1 ? 's' : ''} ${months} mo${months > 1 ? 's' : ''}`;
    } else if (years > 0) {
        return `${years} yr${years > 1 ? 's' : ''}`;
    } else if (months > 0) {
        return `${months} mo${months > 1 ? 's' : ''}`;
    }
    return '';
}

/**
 * Extract latest education and passout year from Education section
 */
function extractLatestEducation() {
    try {
        const anchor = document.querySelector('#education');
        let section = anchor ? anchor.closest('section') : null;
        if (!section) {
            section = Array.from(document.querySelectorAll('section')).find(sec => /education/i.test(sec.textContent || '')) || null;
        }
        if (!section) return { education: '', passout: '', qualification: '' };

        const entity = section.querySelector('[data-view-name="profile-component-entity"], li.artdeco-list__item, .pvs-entity');
        if (!entity) return { education: '', passout: '', qualification: '' };

        let school = '';
        let degree = '';
        let passout = '';
        let qualification = '';

        // Try to get school name from the first link or bold text
        const schoolEl = entity.querySelector('a span[aria-hidden="true"], .t-bold span[aria-hidden="true"], a.optional-action-target-wrapper span');
        school = schoolEl?.innerText?.trim() || '';

        // Try to get degree from span with aria-hidden inside t-14 t-normal
        const degreeSpans = entity.querySelectorAll('span.t-14.t-normal span[aria-hidden="true"]');
        for (const span of degreeSpans) {
            const text = span.innerText?.trim() || '';
            // Check if this looks like a degree (contains Bachelor, Master, B.E, etc.)
            if (/bachelor|master|b\.?e\b|b\.?tech|m\.?tech|m\.?e\b|engineering|diploma|mba|mca|bca|b\.?sc|m\.?sc/i.test(text)) {
                degree = text;
                break;
            }
        }

        // Fallback: try innerText parsing
        if (!degree || !school) {
            const lines = (entity.innerText || '')
                .split('\n')
                .map(t => t.trim())
                .filter(Boolean);
            
            if (!school && lines.length) school = lines[0];
            
            if (!degree) {
                const degreePatterns = /bachelor|master|b\.?tech|b\.?e\b|m\.?tech|m\.?e\b|b\.?sc|m\.?sc|mba|mca|bca|ph\.?d|diploma|b\.?com|m\.?com|b\.?a\b|m\.?a\b|engineering|intermediate/i;
                degree = lines.find(l => degreePatterns.test(l)) || lines[1] || '';
            }
        }

        // Extract passout year from date spans
        const dateSpans = entity.querySelectorAll('span.t-14.t-normal.t-black--light span[aria-hidden="true"], span.pvs-entity__caption-wrapper');
        for (const span of dateSpans) {
            const text = span.innerText?.trim() || '';
            // Look for year range pattern like "2019 - 2023" or single year like "2023"
            const yearRangeMatch = text.match(/\b(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}\b/);
            if (yearRangeMatch) {
                const years = text.match(/\b(19|20)\d{2}\b/g) || [];
                passout = years.length ? years[years.length - 1] : '';
                break;
            }
            // Also check for single year (no range)
            const singleYearMatch = text.match(/\b(19|20)\d{2}\b/);
            if (singleYearMatch && !/\d{6}/.test(text)) { // Avoid postal codes
                passout = singleYearMatch[0];
                break;
            }
        }

        // Fallback for passout from innerText
        if (!passout) {
            const lines = (entity.innerText || '').split('\n').map(t => t.trim()).filter(Boolean);
            // First try to find year range
            let dateLine = lines.find(l => {
                const hasYearRange = /\b(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}\b/.test(l);
                const looksLikeAddress = /\b\d{6}\b/.test(l);
                return hasYearRange && !looksLikeAddress;
            });
            
            if (dateLine) {
                const yearMatches = dateLine.match(/\b(19|20)\d{2}\b/g) || [];
                passout = yearMatches.length ? yearMatches[yearMatches.length - 1] : '';
            } else {
                // Try to find single year (not postal code)
                dateLine = lines.find(l => /\b(19|20)\d{2}\b/.test(l) && !/\d{6}/.test(l));
                if (dateLine) {
                    const yearMatch = dateLine.match(/\b(19|20)\d{2}\b/);
                    passout = yearMatch ? yearMatch[0] : '';
                }
            }
        }

        // Extract qualification from degree text
        // Pattern: "Bachelor of Engineering - BE, Electrical..." → extract "BE"
        const degreeText = degree || '';
        
        // First try to find abbreviation after hyphen: "Bachelor of Engineering - BE"
        const afterHyphen = degreeText.match(/[-–]\s*(B\.?E\.?|B\.?Tech|M\.?Tech|M\.?E\.?|MBA|MCA|BCA|B\.?Sc|M\.?Sc|B\.?Com|M\.?Com|BA|MA|Ph\.?D|BBA|Diploma)\b/i);
        if (afterHyphen) {
            qualification = afterHyphen[1].replace(/\./g, '').toUpperCase();
        } else {
            // Try to find standalone abbreviation
            const qualMatch = degreeText.match(/\b(B\.?E\.?|B\.?Tech|B\.?Sc|M\.?Tech|M\.?E\.?|M\.?Sc|MBA|MCA|BCA|Ph\.?D|B\.?Com|M\.?Com|BA|MA|B\.?Arch|LLB|LLM|MBBS|MD|BBA|Intermediate|Diploma)\b/i);
            if (qualMatch) {
                qualification = qualMatch[1].replace(/\./g, '').toUpperCase();
            } else if (degreeText.toLowerCase().includes('bachelor')) {
                if (/engineering/i.test(degreeText)) qualification = 'BE';
                else if (/technology/i.test(degreeText)) qualification = 'BTECH';
                else if (/science/i.test(degreeText)) qualification = 'BSC';
                else if (/commerce/i.test(degreeText)) qualification = 'BCOM';
                else if (/arts/i.test(degreeText)) qualification = 'BA';
            } else if (degreeText.toLowerCase().includes('master')) {
                if (/engineering/i.test(degreeText)) qualification = 'ME';
                else if (/technology/i.test(degreeText)) qualification = 'MTECH';
                else if (/science/i.test(degreeText)) qualification = 'MSC';
                else if (/business/i.test(degreeText)) qualification = 'MBA';
            }
        }

        const education = degree ? `${degree} @ ${school}` : school;
        return { education, passout, qualification };
    } catch (_) {
        return { education: '', passout: '', qualification: '' };
    }
}

/**
 * Format uppercase degree abbreviation into a readable form.
 * e.g. "MTECH" → "M.Tech", "BE" → "B.E", "BSC" → "B.Sc"
 */
function formatDegreeAbbreviation(abbr) {
    if (!abbr) return '';
    const map = {
        'BE': 'B.E',
        'BTECH': 'B.Tech',
        'BSC': 'B.Sc',
        'BCOM': 'B.Com',
        'BA': 'BA',
        'BBA': 'BBA',
        'BCA': 'BCA',
        'BARCH': 'B.Arch',
        'ME': 'M.E',
        'MTECH': 'M.Tech',
        'MSC': 'M.Sc',
        'MCOM': 'M.Com',
        'MA': 'MA',
        'MBA': 'MBA',
        'MCA': 'MCA',
        'PHD': 'Ph.D',
        'LLB': 'LLB',
        'LLM': 'LLM',
        'MBBS': 'MBBS',
        'MD': 'MD',
        'DIPLOMA': 'Diploma',
        'INTERMEDIATE': 'Intermediate'
    };
    return map[abbr.toUpperCase()] || abbr;
}

/**
 * Extract current company from profile
 */
function extractCurrentCompany() {
    const companySelectors = [
        '.profile-topcard__company-link',
        '[data-test-profile-company]',
        '.pv-top-card--experience-list-item .t-14',
        'a[href*="company"] span[aria-hidden="true"]'
    ];

    for (const selector of companySelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent) {
            const text = el.textContent.trim();
            // Avoid employment types
            if (text && text.length > 2 && !/full[- ]?time|part[- ]?time|contract|intern/i.test(text)) {
                return text;
            }
        }
    }

    return '';
}

/**
 * Check if candidate exists
 */
async function checkCandidate(memberId) {
    try {
        if (!googleSheetsDB) {
            return { exists: false, requiresSetup: true };
        }
        
        if (!googleSheetsDB.credentials) {
            return { exists: false, requiresSetup: true };
        }

        const result = await googleSheetsDB.candidateExists(memberId);
        return { exists: result.exists };
    } catch (error) {
        console.error('Error checking candidate:', error);
        return { exists: false, error: error.message };
    }
}

/**
 * Add candidate to Google Sheets
 */
async function addCandidate(profileData) {
    try {
        if (!googleSheetsDB || !googleSheetsDB.credentials) {
            throw new Error('Spreadsheet API not configured. Click the extension icon to configure.');
        }

        const result = await googleSheetsDB.addCandidate(profileData);
        
        if (result.success) {
            debug('✅ Candidate added:', profileData.full_name);
            return { success: true, data: profileData };
        } else {
            console.error('Failed to add candidate:', result.error);
            return { success: false, error: result.error };
        }
    } catch (error) {
        console.error('Error adding candidate:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Inject banner and form
 */
function injectProcessForm({ type, profileData }) {
    const existingBanner = document.getElementById('linkedin-tracker-banner');
    if (existingBanner) existingBanner.remove();

    const banner = document.createElement('div');
    banner.id = 'linkedin-tracker-banner';
    banner.className = type === 'exists' ? 'linkedin-tracker-banner-warning' : 'linkedin-tracker-banner-success';

    banner.innerHTML = `
        <div class="banner-content">
            <div class="banner-icon">${type === 'exists' ? '📋' : '🆕'}</div>
            <div class="banner-text">
                <strong>${type === 'exists' ? 'Already Tracked' : 'New Processing'}</strong>
                <p>
                    ${type === 'exists' 
                        ? 'This candidate is already in your Google Sheet' 
                        : 'This candidate has been added to your Google Sheet'}
                </p>
                <div class="tracker-form">
                    ${type === 'new' ? `
                    <label class="tracker-label">Company Name (Optional)</label>
                    <textarea id="tracker-company" class="tracker-textarea" placeholder="Company name">${profileData.current_company || ''}</textarea>
                    <label class="tracker-label">Years at Current Company (Optional)</label>
                    <input type="text" id="tracker-years-current" class="tracker-input" placeholder="e.g., 2 yrs 6 mos" value="${profileData.years_at_current || ''}" />
                    ` : ''}
                    <label class="tracker-label">Notes (Optional)</label>
                    <textarea id="tracker-notes" class="tracker-textarea" placeholder="Add notes..."></textarea>
                    <div class="tracker-actions">
                        <button id="tracker-save" class="tracker-button">✓ Save & Update</button>
                    </div>
                </div>
            </div>
            <button id="close-banner" class="banner-close">✕</button>
        </div>
    `;

    document.body.insertBefore(banner, document.body.firstChild);

    const saveBtn = banner.querySelector('#tracker-save');
    const closeBtn = banner.querySelector('#close-banner');

    closeBtn?.addEventListener('click', () => banner.remove());


    saveBtn?.addEventListener('click', async () => {
        const notes = banner.querySelector('#tracker-notes')?.value.trim() || '';
        
        // Only get company/years fields if they exist (type === 'new')
        const companyField = banner.querySelector('#tracker-company');
        const yearsCurrentField = banner.querySelector('#tracker-years-current');
        
        const updateData = {
            notes
        };
        
        // Only include these fields if they exist in the form (to avoid overwriting with empty values)
        if (companyField) {
            updateData.company = companyField.value.trim();
        }
        if (yearsCurrentField) {
            updateData.yearsAtCurrent = yearsCurrentField.value.trim();
        }

        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span style="opacity: 0.7;">Saving...</span>';

        try {
            if (googleSheetsDB) {
                const result = await googleSheetsDB.updateCandidateFields(profileData.member_id, updateData);
                if (!result.success) throw new Error(result.error || 'Update failed');
            }
            saveBtn.innerHTML = '✓ Saved';
            setTimeout(() => banner.remove(), 1000);
        } catch (e) {
            saveBtn.innerHTML = 'Retry Save';
            saveBtn.disabled = false;
            console.error('Save failed:', e);
        }
    });

    debug(`${type === 'exists' ? '⚠️' : '✅'} Banner injected`);
}

/**
 * Main processing function
 */
async function processCandidate() {
    if (processingInProgress) {
        debug('Processing already in progress, skipping...');
        return;
    }
    
    // Rate limiting to prevent infinite loops
    const now = Date.now();
    if (now - lastProcessTime < MIN_PROCESS_INTERVAL) {
        debug('Processing called too frequently, deferring...');
        return;
    }
    lastProcessTime = now;
    
    processingInProgress = true;

    try {
        const memberId = extractMemberId();
        if (!memberId) {
            debug('⚠️ No member ID found, skipping processing');
            processingInProgress = false;
            return;
        }

        if (memberId === currentMemberId) {
            debug('Same candidate, skipping...');
            processingInProgress = false;
            return;
        }
        currentMemberId = memberId;
        debug('Processing candidate:', memberId);

        const checkResult = await checkCandidate(memberId);
        
        if (checkResult.requiresSetup) {
            showSetupBanner();
            processingInProgress = false;
            return;
        }

        const profileData = extractProfileData(memberId);
        if (!profileData || profileData.full_name === 'Unknown') {
            debug('⚠️ Could not extract profile data');
            processingInProgress = false;
            return;
        }

        if (checkResult.exists) {
            injectProcessForm({ type: 'exists', profileData });
        } else {
            const addResult = await addCandidate(profileData);
            if (addResult.success) {
                injectProcessForm({ type: 'new', profileData });
            } else {
                showErrorBanner(addResult.error || 'Failed to add candidate');
            }
        }
    } catch (error) {
        console.error('Error processing candidate:', error);
        showErrorBanner(error.message);
    } finally {
        processingInProgress = false;
    }
}

/**
 * Show setup banner
 */
function showSetupBanner() {
    const existingBanner = document.getElementById('linkedin-tracker-banner');
    if (existingBanner) existingBanner.remove();

    const banner = document.createElement('div');
    banner.id = 'linkedin-tracker-banner';
    banner.className = 'linkedin-tracker-banner-warning';
    banner.innerHTML = `
        <div class="banner-content">
            <div class="banner-icon">⚙️</div>
            <div class="banner-text">
                <strong>Setup Required</strong>
                <p>Please configure your Google Sheets API credentials. Click the extension icon to access Settings.</p>
            </div>
            <button class="banner-close" onclick="this.parentElement.parentElement.remove()">✕</button>
        </div>
    `;
    document.body.insertBefore(banner, document.body.firstChild);
    setTimeout(() => banner.remove(), 5000);
}

/**
 * Show error banner
 */
function showErrorBanner(error) {
    const existingBanner = document.getElementById('linkedin-tracker-banner');
    if (existingBanner) existingBanner.remove();

    const banner = document.createElement('div');
    banner.id = 'linkedin-tracker-banner';
    banner.className = 'linkedin-tracker-banner-warning';
    banner.innerHTML = `
        <div class="banner-content">
            <div class="banner-icon">❌</div>
            <div class="banner-text">
                <strong>Error</strong>
                <p>${error}</p>
            </div>
            <button class="banner-close" onclick="this.parentElement.parentElement.remove()">✕</button>
        </div>
    `;
    document.body.insertBefore(banner, document.body.firstChild);
    setTimeout(() => banner.remove(), 4000);
}

/**
 * Setup URL observer with debounce to prevent infinite loops
 */
function setupUrlObserver() {
    let lastUrl = window.location.href;
    let observerTimeout = null;
    let lastProcessTime = 0;
    const MIN_INTERVAL = 5000; // Minimum 5 seconds between processes
    
    // Use history change detection instead of aggressive MutationObserver
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    
    const onURLChange = () => {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
            debug('URL changed, processing new profile...');
            lastUrl = currentUrl;
            currentMemberId = null;
            
            // Clear existing timeout to debounce
            if (observerTimeout) clearTimeout(observerTimeout);
            
            // Only process if enough time has passed since last process
            const now = Date.now();
            const timeSinceLastProcess = now - lastProcessTime;
            const delayNeeded = Math.max(0, MIN_INTERVAL - timeSinceLastProcess);
            
            observerTimeout = setTimeout(() => {
                lastProcessTime = Date.now();
                processCandidate();
            }, 2500 + delayNeeded);
        }
    };
    
    // Override pushState and replaceState to detect URL changes
    window.history.pushState = function(...args) {
        const result = originalPushState.apply(this, args);
        onURLChange();
        return result;
    };
    
    window.history.replaceState = function(...args) {
        const result = originalReplaceState.apply(this, args);
        onURLChange();
        return result;
    };
    
    // Also listen for popstate events
    window.addEventListener('popstate', onURLChange);
    
    debug('✅ URL observer setup complete');
}

/**
 * Initialize extension
 */
async function init() {
    debug('🚀 LinkedIn Candidate Tracker initialized');
    await initializeGoogleSheetsDB();
    
    const isProfilePage = /linkedin\.com\/(talent|recruiter|in)\//.test(window.location.href);
    if (isProfilePage) {
        setTimeout(() => { processCandidate(); }, 2500);
    }
    setupUrlObserver();
}

// Start initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'recheck') {
        currentMemberId = null;
        processCandidate();
        sendResponse({ success: true });
        return true;
    }
    if (request.action === 'configUpdated') {
        initializeGoogleSheetsDB();
        sendResponse({ success: true });
        return true;
    }
    if (request.action === 'deleteCurrentCandidate') {
        (async () => {
            try {
                const memberId = extractMemberId();
                if (!memberId) {
                    sendResponse({ success: false, error: 'No profile found on this page' });
                    return;
                }
                if (!googleSheetsDB) {
                    sendResponse({ success: false, error: 'Spreadsheet backend not configured' });
                    return;
                }
                const result = await googleSheetsDB.deleteCandidate(memberId);
                if (result) {
                    currentMemberId = null; // Reset so profile can be re-added
                    // Remove banner if present
                    const banner = document.getElementById('linkedin-tracker-banner');
                    if (banner) banner.remove();
                    sendResponse({ success: true });
                } else {
                    sendResponse({ success: false, error: 'Failed to delete candidate' });
                }
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true; // Keep channel open for async response
    }
});

} // End of initialization check
