if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdmin);
} else {
    initAdmin();
}

let GH_OWNER = '';
let GH_REPO = '';
let GH_TOKEN = '';
let GH_BRANCH = 'main';

let configData = {};
let configSha = '';
let configFilePath = 'data/config.json';

let testData = [];
let testSha = '';
let testFilePath = 'data/testimonials.json';

let achieveData = [];
let achieveSha = '';
let achieveFilePath = 'data/achievements.json';

// Helper for safe SessionStorage access in sandboxed iframes
function safeSessionGet(key) {
    try {
        return sessionStorage.getItem(key);
    } catch (e) {
        return null;
    }
}

function safeSessionSet(key, value) {
    try {
        sessionStorage.setItem(key, value);
    } catch (e) {}
}

function safeSessionClear() {
    try {
        sessionStorage.clear();
    } catch (e) {}
}

// Helpers for safe LocalStorage access for persistent login across browser tabs
function safeLocalGet(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        return null;
    }
}

function safeLocalSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {}
}

function safeLocalRemove(key) {
    try {
        localStorage.removeItem(key);
    } catch (e) {}
}

// Check if already logged in via Session Storage or Local Storage
function initAdmin() {
    const storedOwner = safeSessionGet('gh_owner') || safeLocalGet('gh_owner');
    const storedRepo = safeSessionGet('gh_repo') || safeLocalGet('gh_repo');
    const storedToken = safeSessionGet('gh_token') || safeLocalGet('gh_token');
    const storedBranch = safeSessionGet('gh_branch') || safeLocalGet('gh_branch');
    const storedScheme = safeSessionGet('gh_auth_scheme') || safeLocalGet('gh_auth_scheme');

    if (storedScheme) GH_AUTH_SCHEME = storedScheme;
    if (storedBranch) GH_BRANCH = storedBranch;

    if (storedOwner && storedRepo && storedToken) {
        GH_OWNER = storedOwner;
        GH_REPO = storedRepo;
        GH_TOKEN = storedToken;
        showDashboard();
    }

    setupAuth();
    setupLicBrandUpload();
    setupFaviconUpload();
    setupImageUpload();
}

// ---- Authentication ----

let GH_AUTH_SCHEME = 'token'; // 'token' or 'Bearer'

function getAuthHeader(token) {
    const clean = (token || '').trim();
    if (clean.startsWith('token ') || clean.startsWith('Bearer ')) {
        return clean;
    }
    // Fine-grained personal access tokens on GitHub strictly require Bearer
    if (clean.startsWith('github_pat_')) {
        return `Bearer ${clean}`;
    }
    return `${GH_AUTH_SCHEME} ${clean}`;
}

async function githubRequest(url, options = {}) {
    let authHeader = getAuthHeader(GH_TOKEN);
    let res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': authHeader,
            'Accept': 'application/vnd.github.v3+json',
            ...(options.headers || {})
        }
    });

    // If 401 Unauthorized, automatically try alternate auth scheme (token vs Bearer)
    if (res.status === 401) {
        const altScheme = GH_AUTH_SCHEME === 'token' ? 'Bearer' : 'token';
        const rawToken = GH_TOKEN.trim().replace(/^(token|Bearer)\s+/i, '');
        const altHeader = `${altScheme} ${rawToken}`;
        const retryRes = await fetch(url, {
            ...options,
            headers: {
                'Authorization': altHeader,
                'Accept': 'application/vnd.github.v3+json',
                ...(options.headers || {})
            }
        });
        if (retryRes.ok) {
            GH_AUTH_SCHEME = altScheme;
            safeSessionSet('gh_auth_scheme', altScheme);
            return retryRes;
        }
    }

    return res;
}

function setupAuth() {
    const authForm = document.getElementById('auth-form');
    const connectBtn = document.getElementById('connect-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const ownerInput = document.getElementById('gh-owner');
    const repoInput = document.getElementById('gh-repo');
    const tokenInput = document.getElementById('gh-token');
    const rememberCheckbox = document.getElementById('gh-remember');
    const toggleTokenBtn = document.getElementById('toggle-token-visibility');

    // Pre-fill with saved or canonical defaults
    const savedOwner = safeLocalGet('gh_owner') || safeSessionGet('gh_owner');
    const savedRepo = safeLocalGet('gh_repo') || safeSessionGet('gh_repo');
    const savedToken = safeLocalGet('gh_token') || safeSessionGet('gh_token');

    if (ownerInput && !ownerInput.value) {
        ownerInput.value = savedOwner || 'sukhamaym1';
    }
    if (repoInput && !repoInput.value) {
        repoInput.value = savedRepo || 'Sanchita.lic';
    }
    if (tokenInput && !tokenInput.value && savedToken) {
        tokenInput.value = savedToken;
    }

    // Password visibility toggle
    if (toggleTokenBtn && tokenInput) {
        toggleTokenBtn.addEventListener('click', () => {
            const isPassword = tokenInput.type === 'password';
            tokenInput.type = isPassword ? 'text' : 'password';
            const eyeIcon = document.getElementById('eye-icon');
            const eyeOffIcon = document.getElementById('eye-off-icon');
            if (eyeIcon && eyeOffIcon) {
                eyeIcon.classList.toggle('hidden', isPassword);
                eyeOffIcon.classList.toggle('hidden', !isPassword);
            }
        });
    }

    // Auto-parse if user pastes full GitHub URL into owner or repo input
    function autoParseGithubUrl(e) {
        const val = e.target.value.trim();
        if (val.includes('github.com/')) {
            const cleanUrl = val.replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, '');
            const parts = cleanUrl.split('/');
            if (parts.length >= 1 && parts[0]) {
                ownerInput.value = parts[0];
            }
            if (parts.length >= 2 && parts[1]) {
                repoInput.value = parts[1].replace(/\.git$/i, '');
            }
        }
    }

    if (ownerInput) ownerInput.addEventListener('input', autoParseGithubUrl);
    if (repoInput) repoInput.addEventListener('input', autoParseGithubUrl);

    let isConnecting = false;

    async function handleConnect() {
        if (isConnecting) return;

        const errEl = document.getElementById('auth-error');
        const btnText = document.getElementById('connect-btn-text');
        const btnSpinner = document.getElementById('connect-btn-spinner');

        if (errEl) errEl.classList.add('hidden');

        let rawOwner = ownerInput ? ownerInput.value.trim() : '';
        let rawRepo = repoInput ? repoInput.value.trim() : '';
        let rawToken = tokenInput ? tokenInput.value.trim().replace(/^["']|["']$/g, '') : '';

        // Strip invisible zero-width characters and spaces
        rawToken = rawToken.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

        // Sanitize owner if a URL was entered
        if (rawOwner.includes('github.com/')) {
            const clean = rawOwner.replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, '');
            const parts = clean.split('/');
            GH_OWNER = parts[0] || '';
            if (parts[1] && !rawRepo) {
                GH_REPO = parts[1].replace(/\.git$/i, '');
                if (repoInput) repoInput.value = GH_REPO;
            } else {
                GH_REPO = rawRepo;
            }
            if (ownerInput) ownerInput.value = GH_OWNER;
        } else {
            GH_OWNER = rawOwner.replace(/^@/, '').replace(/\/+$/, '').trim();
            GH_REPO = rawRepo.replace(/\.git$/i, '').trim();
        }

        // Auto-correct common mistakes:
        // 1. If user typed their email prefix 'sukhamay153' instead of GitHub handle 'sukhamaym1'
        if (GH_OWNER.toLowerCase() === 'sukhamay153') {
            GH_OWNER = 'sukhamaym1';
            if (ownerInput) ownerInput.value = GH_OWNER;
        }

        // 2. If user typed previous repository name variations
        if (['sanchita-adhikary', 'sanchita_adhikary', 'sanchita-lic'].includes(GH_REPO.toLowerCase())) {
            GH_REPO = 'Sanchita.lic';
            if (repoInput) repoInput.value = GH_REPO;
        }

        // Clean up repo if full URL was entered
        if (GH_REPO.includes('github.com/')) {
            const cleanRepo = GH_REPO.replace(/^https?:\/\/github\.com\/[^/]+\//i, '').replace(/\/+$/, '');
            GH_REPO = cleanRepo.replace(/\.git$/i, '');
            if (repoInput) repoInput.value = GH_REPO;
        }

        GH_TOKEN = rawToken;
        if (GH_TOKEN.startsWith('github_pat_')) {
            GH_AUTH_SCHEME = 'Bearer';
        }

        if (!GH_OWNER || !GH_REPO || !GH_TOKEN) {
            showAuthError("Please provide your GitHub Username, Repository Name, and Personal Access Token.");
            return;
        }

        isConnecting = true;
        // Show loading state
        if (btnText) btnText.textContent = 'Verifying with GitHub...';
        if (btnSpinner) btnSpinner.classList.remove('hidden');
        if (connectBtn) connectBtn.disabled = true;

        try {
            // STEP 1: Verify the token itself by checking GitHub User API
            const userRes = await githubRequest('https://api.github.com/user');

            if (userRes.status === 401) {
                showAuthError(`
                    <div class="space-y-2 text-left">
                        <div class="font-bold flex items-center gap-1.5 text-red-800">
                            <span>❌ Token Expired or Invalid (401 Bad credentials)</span>
                        </div>
                        <p class="text-xs text-red-700 leading-relaxed">
                            GitHub rejected this token. <strong>GitHub Personal Access Tokens expire every 30 days by default</strong>, which is why this login error appears periodically.
                        </p>
                        <div class="pt-1">
                            <a href="https://github.com/settings/tokens/new?description=Sanchita-Website-Admin&scopes=repo" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white font-medium text-xs rounded transition-colors shadow-xs">
                                🔑 Generate New Token on GitHub (1-Click)
                            </a>
                        </div>
                        <p class="text-[11px] text-red-600 mt-0.5">
                            <strong>Tip:</strong> In the GitHub token page, set <strong>Expiration</strong> to <strong>90 days</strong> or <strong>No expiration</strong> and keep <strong>repo</strong> checked so you don't get logged out again.
                        </p>
                    </div>
                `);
                return;
            }

            if (userRes.ok) {
                try {
                    const userInfo = await userRes.json();
                    if (userInfo && userInfo.login && userInfo.login.toLowerCase() !== GH_OWNER.toLowerCase()) {
                        GH_OWNER = userInfo.login;
                        if (ownerInput) ownerInput.value = GH_OWNER;
                    }
                } catch (e) {}
            }

            // STEP 2: Verify repository access
            const res = await githubRequest(`https://api.github.com/repos/${encodeURIComponent(GH_OWNER)}/${encodeURIComponent(GH_REPO)}`);

            if (res.ok) {
                try {
                    const repoInfo = await res.json();
                    if (repoInfo && repoInfo.name) {
                        GH_REPO = repoInfo.name;
                        if (repoInput) repoInput.value = GH_REPO;
                    }
                    if (repoInfo && repoInfo.default_branch) {
                        GH_BRANCH = repoInfo.default_branch;
                    }
                } catch (e) {
                    console.warn('Could not inspect repo default branch:', e);
                }

                // Save to Session Storage
                safeSessionSet('gh_owner', GH_OWNER);
                safeSessionSet('gh_repo', GH_REPO);
                safeSessionSet('gh_token', GH_TOKEN);
                safeSessionSet('gh_branch', GH_BRANCH);
                safeSessionSet('gh_auth_scheme', GH_AUTH_SCHEME);

                // If user checked "Remember me", also save to Local Storage
                const rememberEl = document.getElementById('gh-remember');
                const shouldRemember = rememberEl ? rememberEl.checked : true;
                if (shouldRemember) {
                    safeLocalSet('gh_owner', GH_OWNER);
                    safeLocalSet('gh_repo', GH_REPO);
                    safeLocalSet('gh_token', GH_TOKEN);
                    safeLocalSet('gh_branch', GH_BRANCH);
                    safeLocalSet('gh_auth_scheme', GH_AUTH_SCHEME);
                } else {
                    safeLocalRemove('gh_owner');
                    safeLocalRemove('gh_repo');
                    safeLocalRemove('gh_token');
                    safeLocalRemove('gh_branch');
                    safeLocalRemove('gh_auth_scheme');
                }

                showDashboard();
            } else if (res.status === 404) {
                showAuthError(`
                    <div class="space-y-2 text-left">
                        <div class="font-bold text-red-800">Repository Not Found (404)</div>
                        <p class="text-xs text-red-700">
                            Could not find repository "<strong>${GH_OWNER}/${GH_REPO}</strong>".
                        </p>
                        <p class="text-xs text-red-700">
                            Your official GitHub repository is <strong class="text-red-900">sukhamaym1/Sanchita.lic</strong>.
                        </p>
                        <button type="button" id="fix-repo-btn" class="px-3 py-1.5 bg-red-700 text-white rounded text-xs font-semibold hover:bg-red-800 transition-colors">
                            Use "Sanchita.lic" &amp; Retry
                        </button>
                    </div>
                `);
                const fixBtn = document.getElementById('fix-repo-btn');
                if (fixBtn) {
                    fixBtn.addEventListener('click', () => {
                        if (repoInput) repoInput.value = 'Sanchita.lic';
                        GH_REPO = 'Sanchita.lic';
                        handleConnect();
                    });
                }
            } else if (res.status === 403) {
                showAuthError(`
                    <div class="space-y-1.5 text-left">
                        <div class="font-bold text-red-800">Access Forbidden (403)</div>
                        <p class="text-xs text-red-700 leading-relaxed">
                            Your token is valid, but it does not have permission to access <strong>${GH_OWNER}/${GH_REPO}</strong>. Make sure you checked the <code class="bg-red-100 px-1 py-0.5 rounded font-mono">repo</code> scope when generating your token on GitHub.
                        </p>
                        <a href="https://github.com/settings/tokens/new?description=Sanchita-Website-Admin&scopes=repo" target="_blank" rel="noopener" class="inline-block text-xs font-semibold text-red-800 underline mt-1">
                            Generate token with repo scope &rarr;
                        </a>
                    </div>
                `);
            } else {
                showAuthError(`GitHub API error (${res.status}): Failed to connect to ${GH_OWNER}/${GH_REPO}.`);
            }
        } catch (error) {
            showAuthError(`Connection error: ${error.message || "Failed to contact GitHub API. Please check your network or browser settings."}`);
        } finally {
            isConnecting = false;
            if (btnText) btnText.textContent = 'Connect to Admin';
            if (btnSpinner) btnSpinner.classList.add('hidden');
            if (connectBtn) connectBtn.disabled = false;
        }
    }

    if (connectBtn) {
        connectBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleConnect();
        });
    }

    if (authForm) {
        authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleConnect();
            return false;
        });
    }

    // Support pressing Enter in any input field
    [ownerInput, repoInput, tokenInput].forEach(input => {
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConnect();
                }
            });
        }
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            safeSessionClear();
            safeLocalRemove('gh_owner');
            safeLocalRemove('gh_repo');
            safeLocalRemove('gh_token');
            safeLocalRemove('gh_branch');
            safeLocalRemove('gh_auth_scheme');
            location.reload();
        });
    }
}

function showAuthError(msgOrHtml) {
    const errEl = document.getElementById('auth-error');
    if (errEl) {
        if (typeof msgOrHtml === 'string' && (msgOrHtml.includes('<div') || msgOrHtml.includes('<p') || msgOrHtml.includes('<a') || msgOrHtml.includes('<button'))) {
            errEl.innerHTML = msgOrHtml;
        } else {
            errEl.textContent = msgOrHtml;
        }
        errEl.classList.remove('hidden');
    }
}

function showDashboard() {
    const authSec = document.getElementById('auth-section');
    const dashSec = document.getElementById('dashboard-section');
    if (authSec) authSec.classList.add('hidden');
    if (dashSec) dashSec.classList.remove('hidden');

    const connRepo = document.getElementById('connected-repo');
    if (connRepo) connRepo.textContent = `${GH_OWNER}/${GH_REPO}`;
    
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        try { window.lucide.createIcons(); } catch (e) {}
    }

    fetchSiteData();
}

// ---- GitHub API Helpers ----

async function fetchFileFromGithub(path) {
    const res = await githubRequest(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, {
        cache: 'no-store' // Prevent caching old SHAs
    });
    
    if (!res.ok) throw new Error(`Failed to fetch ${path}`);
    const data = await res.json();
    
    // Decode base64 content securely supporting UTF-8
    const binary = window.atob((data.content || '').replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const content = new TextDecoder('utf-8').decode(bytes);
    return {
        content: JSON.parse(content),
        sha: data.sha
    };
}

async function saveFileToGithub(path, contentStr, message, sha) {
    // Encode to base64 securely supporting UTF-8
    const utf8Bytes = new TextEncoder().encode(contentStr);
    let binaryStr = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
        binaryStr += String.fromCharCode(utf8Bytes[i]);
    }
    const base64Content = window.btoa(binaryStr);
    
    const body = {
        message: message,
        content: base64Content,
        branch: GH_BRANCH || 'main'
    };
    if (sha) body.sha = sha;

    const res = await githubRequest(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Error saving file');
    }
    const data = await res.json();
    return data.content.sha; // return new sha
}

function showStatus(elementId, msg, isError = false) {
    const el = document.getElementById(elementId);
    el.textContent = msg;
    el.className = `mt-4 p-3 rounded-md text-sm border ${isError ? 'bg-red-50 text-red-600 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
}

// ---- Data Fetching & Rendering ----

async function fetchSiteData() {
    try {
        let config;
        try {
            config = await fetchFileFromGithub('data/config.json');
            configFilePath = 'data/config.json';
        } catch (e) {
            config = await fetchFileFromGithub('config.json');
            configFilePath = 'config.json';
        }
        configData = config.content;
        configSha = config.sha;
        renderConfigForm();
        if (typeof window.refreshLicBrandDisplay === 'function') {
            window.refreshLicBrandDisplay();
        }
    } catch (e) {
        console.error("Config missing or error:", e);
    }

    try {
        let tests;
        try {
            tests = await fetchFileFromGithub('data/testimonials.json');
            testFilePath = 'data/testimonials.json';
        } catch (e) {
            tests = await fetchFileFromGithub('testimonials.json');
            testFilePath = 'testimonials.json';
        }
        testData = tests.content;
        testSha = tests.sha;
        renderTestimonialsList();
    } catch (e) {
        console.error("Testimonials missing or error:", e);
    }
    
    try {
        let ach;
        try {
            ach = await fetchFileFromGithub('data/achievements.json');
            achieveFilePath = 'data/achievements.json';
        } catch (e) {
            ach = await fetchFileFromGithub('achievements.json');
            achieveFilePath = 'achievements.json';
        }
        achieveData = ach.content;
        achieveSha = ach.sha;
        renderAchievementsList();
    } catch (e) {
        console.error("Achievements missing or error:", e);
    }
}

// Config Editor
function renderConfigForm() {
    const container = document.getElementById('config-form-fields');
    container.innerHTML = '';

    const fields = [
        { key: 'name', label: 'Full Name' },
        { key: 'designation', label: 'Designation' },
        { key: 'credential', label: 'Club / Honor (e.g. DM Club Member)' },
        { key: 'phone', label: 'Phone Number (Display)' },
        { key: 'whatsapp', label: 'WhatsApp Number (No +, country code only)' },
        { key: 'email', label: 'Email Address' },
        { key: 'serviceArea', label: 'Service Area' },
        { key: 'workingHours', label: 'Working Hours' },
        { key: 'googleAppsScriptUrl', label: 'Google Apps Script URL (For Contact Form)' },
        { key: 'googleSpreadsheetUrl', label: 'Google Sheets URL (View Client Leads)' },
        { key: 'facebook', label: 'Facebook Page URL' },
        { key: 'instagram', label: 'Instagram Profile URL' },
        { key: 'linkedin', label: 'LinkedIn Profile URL' },
        { key: 'twitter', label: 'Twitter / X Profile URL' },
        { key: 'licAppUrl', label: 'Official LIC Customer Super App Play Store URL' },
        { key: 'googleMapsUrl', label: 'Google Maps Embed URL' }
    ];

    fields.forEach(f => {
        const div = document.createElement('div');
        div.innerHTML = `
            <label class="block text-sm font-medium text-gray-700 mb-1">${f.label}</label>
            <input type="text" data-config-key="${f.key}" value="${configData[f.key] || ''}" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-slate-900 focus:border-slate-900">
        `;
        container.appendChild(div);
    });

    const sheetLink = document.getElementById('admin-sheet-link');
    if (sheetLink && configData.googleSpreadsheetUrl) {
        sheetLink.href = configData.googleSpreadsheetUrl;
    }

    document.getElementById('save-config-btn').addEventListener('click', async (e) => {
        const btn = e.target;
        btn.textContent = 'Saving...';
        btn.disabled = true;

        // Gather data
        document.querySelectorAll('input[data-config-key]').forEach(input => {
            const key = input.getAttribute('data-config-key');
            configData[key] = input.value;
        });

        try {
            configSha = await saveFileToGithub(configFilePath, JSON.stringify(configData, null, 2), `Admin: Update ${configFilePath}`, configSha);
            showStatus('config-status', 'Configuration saved successfully! Changes are live on GitHub.');
        } catch (error) {
            showStatus('config-status', error.message, true);
        } finally {
            btn.textContent = 'Save Changes';
            btn.disabled = false;
        }
    });
}

// Testimonials Editor
function renderTestimonialsList() {
    const container = document.getElementById('testimonials-list');
    container.innerHTML = '';

    testData.forEach((t, index) => {
        const div = document.createElement('div');
        div.className = 'p-4 border border-slate-200 rounded-lg bg-slate-50 relative group';
        div.innerHTML = `
            <button class="absolute top-2 right-2 text-red-500 hover:text-red-700 hidden group-hover:block" onclick="deleteTestimonial(${index})" title="Delete">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
            <div class="space-y-3">
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-medium text-gray-500 mb-1">Customer Name</label>
                        <input type="text" class="w-full text-sm px-2 py-1 border border-gray-300 rounded" value="${t.name || ''}" onchange="updateTestimonial(${index}, 'name', this.value)">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-500 mb-1">Details/Profession</label>
                        <input type="text" class="w-full text-sm px-2 py-1 border border-gray-300 rounded" value="${t.details || ''}" onchange="updateTestimonial(${index}, 'details', this.value)">
                    </div>
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-500 mb-1">Review Text</label>
                    <textarea class="w-full text-sm px-2 py-1 border border-gray-300 rounded h-16" onchange="updateTestimonial(${index}, 'text', this.value)">${t.text || ''}</textarea>
                </div>
            </div>
        `;
        container.appendChild(div);
    });

    if(window.lucide) window.lucide.createIcons();
}

window.updateTestimonial = function(index, field, value) {
    testData[index][field] = value;
}

window.deleteTestimonial = function(index) {
    if(confirm('Remove this testimonial?')) {
        testData.splice(index, 1);
        renderTestimonialsList();
    }
}

document.getElementById('add-testimonial-btn').addEventListener('click', () => {
    testData.push({ id: Date.now(), name: '', details: '', text: '', rating: 5 });
    renderTestimonialsList();
});

document.getElementById('save-testimonials-btn').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        testSha = await saveFileToGithub(testFilePath, JSON.stringify(testData, null, 2), `Admin: Update ${testFilePath}`, testSha);
        showStatus('test-status', 'Testimonials saved successfully! Changes are live on GitHub.');
    } catch (error) {
        showStatus('test-status', error.message, true);
    } finally {
        btn.textContent = 'Save Testimonials';
        btn.disabled = false;
    }
});

// ---- Favicon Upload & Live Dynamic Sync ----

function applyTabFavicon(url) {
    if (!url) return;
    let iconLink = document.querySelector("link[rel~='icon']");
    if (!iconLink) {
        iconLink = document.createElement('link');
        iconLink.rel = 'icon';
        document.head.appendChild(iconLink);
    }
    iconLink.href = url;

    let altIconLink = document.querySelector("link[rel='alternate icon']");
    if (altIconLink) {
        altIconLink.href = url;
    }

    let appleIconLink = document.querySelector("link[rel='apple-touch-icon']");
    if (appleIconLink) {
        appleIconLink.href = url;
    }
}

function setupFaviconUpload() {
    const dropZone = document.getElementById('favicon-drop-zone');
    const fileInput = document.getElementById('favicon-upload');
    const previewContainer = document.getElementById('favicon-preview-container');
    const previewLg = document.getElementById('favicon-preview-lg');
    const previewSm = document.getElementById('favicon-preview-sm');
    const fileInfo = document.getElementById('favicon-file-info');
    const saveBtn = document.getElementById('save-favicon-btn');
    const saveBtnText = document.getElementById('save-favicon-btn-text');
    const saveBtnSpinner = document.getElementById('save-favicon-spinner');
    const cancelBtn = document.getElementById('cancel-favicon-btn');
    const resetBtn = document.getElementById('reset-favicon-btn');
    const currentFaviconImg = document.getElementById('admin-current-favicon');

    let selectedDataUrl = null;
    let selectedFile = null;

    // Load active favicon into preview
    function refreshCurrentFaviconDisplay() {
        let activeUrl = '/favicon.svg';
        try {
            const stored = localStorage.getItem('site_custom_favicon');
            if (stored) {
                activeUrl = stored;
            } else if (configData && configData.faviconUrl) {
                activeUrl = configData.faviconUrl;
            }
        } catch(e) {}
        if (currentFaviconImg) {
            currentFaviconImg.src = activeUrl;
        }
        applyTabFavicon(activeUrl);
    }

    refreshCurrentFaviconDisplay();

    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());

        // Drag & drop handlers
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.add('border-slate-900', 'bg-slate-100');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.remove('border-slate-900', 'bg-slate-100');
            }, false);
        });

        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files[0]) {
                handleFaviconSelect(files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleFaviconSelect(e.target.files[0]);
            }
        });
    }

    function handleFaviconSelect(file) {
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            showStatus('favicon-status', 'File is too large. Favicon must be under 2MB.', true);
            return;
        }

        selectedFile = file;

        const reader = new FileReader();
        reader.onload = (event) => {
            selectedDataUrl = event.target.result;
            if (previewLg) previewLg.src = selectedDataUrl;
            if (previewSm) previewSm.src = selectedDataUrl;
            if (fileInfo) {
                const kb = (file.size / 1024).toFixed(1);
                fileInfo.textContent = `${file.name} (${kb} KB, ${file.type || 'image'})`;
            }
            if (previewContainer) previewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            selectedDataUrl = null;
            selectedFile = null;
            if (fileInput) fileInput.value = '';
            if (previewContainer) previewContainer.classList.add('hidden');
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            if (!confirm('Reset favicon back to the official Life Insurance Corporation of India (LIC) emblem?')) return;
            try {
                localStorage.removeItem('site_custom_favicon');
                localStorage.removeItem('site_custom_favicon_updated');
                if (configData) {
                    configData.faviconUrl = '/favicon.svg';
                }
                refreshCurrentFaviconDisplay();
                window.dispatchEvent(new CustomEvent('site-favicon-updated', { detail: { dataUrl: '/favicon.svg' } }));
                showStatus('favicon-status', 'Favicon reset to official default emblem.');
            } catch (err) {
                showStatus('favicon-status', 'Error resetting favicon: ' + err.message, true);
            }
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            if (!selectedDataUrl) return;

            if (saveBtnText) saveBtnText.textContent = 'Saving Favicon...';
            if (saveBtnSpinner) saveBtnSpinner.classList.remove('hidden');
            saveBtn.disabled = true;

            try {
                let savedUrl = selectedDataUrl;

                // 1. Try Dev Server API
                try {
                    const apiRes = await fetch('/api/upload-favicon', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            dataUrl: selectedDataUrl,
                            filename: selectedFile ? selectedFile.name : 'favicon.png'
                        })
                    });
                    if (apiRes.ok) {
                        const resData = await apiRes.json();
                        if (resData.faviconUrl) {
                            savedUrl = resData.faviconUrl;
                        }
                    }
                } catch (e) {
                    console.warn('Dev server upload endpoint bypassed:', e);
                }

                // 2. If connected to GitHub, commit to repository
                if (GH_OWNER && GH_REPO && GH_TOKEN && selectedDataUrl.includes(',')) {
                    try {
                        const base64Content = selectedDataUrl.split(',')[1];
                        const isSvg = selectedFile && selectedFile.type && selectedFile.type.includes('svg');
                        const targetRepoPath = isSvg ? 'public/favicon.svg' : 'public/favicon.png';

                        // Check existing SHA
                        let targetSha = null;
                        try {
                            const shaRes = await githubRequest(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${targetRepoPath}`);
                            if (shaRes.ok) {
                                const shaData = await shaRes.json();
                                targetSha = shaData.sha;
                            }
                        } catch(e) {}

                        const putBody = {
                            message: `Admin: Update website favicon (${targetRepoPath})`,
                            content: base64Content,
                            branch: 'main'
                        };
                        if (targetSha) putBody.sha = targetSha;

                        await githubRequest(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${targetRepoPath}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(putBody)
                        });

                        // Update config.json on GitHub
                        if (configData) {
                            configData.faviconUrl = `/${targetRepoPath.replace(/^public\//, '')}?v=${Date.now()}`;
                            configSha = await saveFileToGithub(configFilePath, JSON.stringify(configData, null, 2), 'Admin: Update faviconUrl in config.json', configSha);
                        }
                    } catch (ghErr) {
                        console.warn('GitHub favicon sync notice:', ghErr);
                    }
                }

                // 3. Save to localStorage for instant real-time browser persistence across all tabs
                try {
                    localStorage.setItem('site_custom_favicon', selectedDataUrl);
                    localStorage.setItem('site_custom_favicon_updated', Date.now().toString());
                } catch(e) {}

                // 4. Update tab icon and live mockup preview
                applyTabFavicon(selectedDataUrl);
                if (currentFaviconImg) {
                    currentFaviconImg.src = selectedDataUrl;
                }

                // 5. Broadcast to any open windows/tabs
                window.dispatchEvent(new CustomEvent('site-favicon-updated', { detail: { dataUrl: selectedDataUrl } }));

                // 6. Reset UI state
                if (previewContainer) previewContainer.classList.add('hidden');
                if (fileInput) fileInput.value = '';
                selectedDataUrl = null;
                selectedFile = null;

                showStatus('favicon-status', 'Favicon uploaded successfully! The new icon is now active everywhere across your website.');
            } catch (error) {
                showStatus('favicon-status', 'Upload failed: ' + error.message, true);
            } finally {
                if (saveBtnText) saveBtnText.textContent = 'Upload & Apply Favicon';
                if (saveBtnSpinner) saveBtnSpinner.classList.add('hidden');
                saveBtn.disabled = false;
            }
        });
    }
}

// ---- Product Manufacturer & Insurer Branding (LIC Logo & Hero Badge) Upload ----

function setupLicBrandUpload() {
    const dropZone = document.getElementById('lic-logo-drop-zone');
    const fileInput = document.getElementById('lic-logo-upload');
    const syncBothCheckbox = document.getElementById('lic-sync-both-places');
    const toggleSeparateBtn = document.getElementById('toggle-separate-badge-btn');
    const separateContainer = document.getElementById('separate-badge-container');
    const closeSeparateBtn = document.getElementById('close-separate-badge-btn');
    const badgeDropZone = document.getElementById('lic-badge-drop-zone');
    const badgeFileInput = document.getElementById('lic-badge-upload');
    const badgePreviewBox = document.getElementById('lic-badge-preview-box');
    const badgePreviewImg = document.getElementById('lic-badge-preview-img');
    const badgeFileName = document.getElementById('lic-badge-file-name');

    const previewContainer = document.getElementById('lic-logo-preview-container');
    const previewImg = document.getElementById('lic-logo-preview-img');
    const fileInfo = document.getElementById('lic-logo-file-info');
    const targetScope = document.getElementById('lic-logo-target-scope');
    const saveBtn = document.getElementById('save-lic-brand-btn');
    const saveBtnText = document.getElementById('save-lic-brand-btn-text');
    const saveBtnSpinner = document.getElementById('save-lic-brand-spinner');
    const cancelBtn = document.getElementById('cancel-lic-brand-btn');
    const resetBtn = document.getElementById('reset-lic-brand-btn');

    const adminHeaderLogo = document.getElementById('admin-current-header-logo');
    const adminHeroBadge = document.getElementById('admin-current-hero-badge');
    const adminShowcaseLogo = document.getElementById('admin-current-showcase-logo');
    const adminFooterLogo = document.getElementById('admin-current-footer-logo');

    let selectedLogoDataUrl = null;
    let selectedLogoFile = null;
    let selectedBadgeDataUrl = null;
    let selectedBadgeFile = null;

    // Load active brand images into live preview mockups
    function refreshCurrentLicDisplay() {
        let activeLogo = '/assets/images/lic-logo-white.svg';
        let activeBadge = '/assets/images/favicon.svg';
        let activeFooter = '/assets/images/lic-logo-white.svg';

        try {
            const storedLogo = localStorage.getItem('site_custom_lic_logo');
            if (storedLogo) {
                activeLogo = storedLogo;
            } else if (configData && configData.licLogoUrl) {
                activeLogo = configData.licLogoUrl;
            }

            const storedBadge = localStorage.getItem('site_custom_lic_badge');
            if (storedBadge) {
                activeBadge = storedBadge;
            } else if (storedLogo && (!configData || !configData.licBadgeIconUrl)) {
                activeBadge = storedLogo;
            } else if (configData && configData.licBadgeIconUrl) {
                activeBadge = configData.licBadgeIconUrl;
            }

            const storedFooter = localStorage.getItem('site_custom_lic_footer');
            if (storedFooter) {
                activeFooter = storedFooter;
            } else if (storedLogo) {
                activeFooter = storedLogo;
            } else if (configData && configData.footerLicLogoUrl) {
                activeFooter = configData.footerLicLogoUrl;
            } else {
                activeFooter = activeLogo;
            }
        } catch (e) {}

        if (adminHeaderLogo) adminHeaderLogo.src = activeLogo;
        if (adminShowcaseLogo) adminShowcaseLogo.src = activeLogo;
        if (adminHeroBadge) adminHeroBadge.src = activeBadge;
        if (adminFooterLogo) adminFooterLogo.src = activeFooter;
    }

    // Expose for external refreshes
    window.refreshLicBrandDisplay = refreshCurrentLicDisplay;
    refreshCurrentLicDisplay();

    // Toggle separate badge upload
    if (toggleSeparateBtn && separateContainer) {
        toggleSeparateBtn.addEventListener('click', () => {
            separateContainer.classList.remove('hidden');
            if (syncBothCheckbox) syncBothCheckbox.checked = false;
            updateScopeText();
        });
    }

    if (closeSeparateBtn && separateContainer) {
        closeSeparateBtn.addEventListener('click', () => {
            separateContainer.classList.add('hidden');
            selectedBadgeDataUrl = null;
            selectedBadgeFile = null;
            if (badgeFileInput) badgeFileInput.value = '';
            if (badgePreviewBox) badgePreviewBox.classList.add('hidden');
            if (syncBothCheckbox) syncBothCheckbox.checked = true;
            refreshCurrentLicDisplay();
            updateScopeText();
        });
    }

    function updateScopeText() {
        if (!targetScope) return;
        const syncBoth = syncBothCheckbox ? syncBothCheckbox.checked : true;
        if (selectedBadgeDataUrl) {
            targetScope.textContent = 'Main logo will update Header & Showcase. Separate badge will update Hero Pill.';
        } else if (syncBoth) {
            targetScope.textContent = 'Will be applied to Header, Hero Badge & Showcase automatically.';
        } else {
            targetScope.textContent = 'Will be applied to Header Navigation & Showcase Card.';
        }
    }

    if (syncBothCheckbox) {
        syncBothCheckbox.addEventListener('change', () => {
            updateScopeText();
            if (selectedLogoDataUrl && syncBothCheckbox.checked && adminHeroBadge && !selectedBadgeDataUrl) {
                adminHeroBadge.src = selectedLogoDataUrl;
            } else if (!syncBothCheckbox.checked && adminHeroBadge && !selectedBadgeDataUrl) {
                refreshCurrentLicDisplay();
            }
        });
    }

    // Main Logo File Handling
    function handleLogoSelect(file) {
        if (!file) return;

        if (!file.type.match('image.*') && !file.name.endsWith('.svg')) {
            showStatus('lic-brand-status', 'Please select a valid image file (PNG, SVG, JPG, or WEBP).', true);
            return;
        }

        if (file.size > 3 * 1024 * 1024) {
            showStatus('lic-brand-status', 'File size exceeds 3MB. Please choose a smaller image.', true);
            return;
        }

        selectedLogoFile = file;
        const reader = new FileReader();
        reader.onload = (event) => {
            selectedLogoDataUrl = event.target.result;
            if (previewImg) previewImg.src = selectedLogoDataUrl;
            if (fileInfo) {
                const kb = (file.size / 1024).toFixed(1);
                fileInfo.textContent = `${file.name} (${kb} KB)`;
            }
            updateScopeText();

            // Real-time update live mockups
            if (adminHeaderLogo) adminHeaderLogo.src = selectedLogoDataUrl;
            if (adminShowcaseLogo) adminShowcaseLogo.src = selectedLogoDataUrl;
            if (adminFooterLogo) adminFooterLogo.src = selectedLogoDataUrl;
            if ((!selectedBadgeDataUrl && (!syncBothCheckbox || syncBothCheckbox.checked)) && adminHeroBadge) {
                adminHeroBadge.src = selectedLogoDataUrl;
            }

            if (previewContainer) previewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }

    // Dedicated Badge File Handling
    function handleBadgeSelect(file) {
        if (!file) return;

        if (!file.type.match('image.*') && !file.name.endsWith('.svg')) {
            showStatus('lic-brand-status', 'Please select a valid image file for the badge.', true);
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            showStatus('lic-brand-status', 'Badge file size exceeds 2MB.', true);
            return;
        }

        selectedBadgeFile = file;
        const reader = new FileReader();
        reader.onload = (event) => {
            selectedBadgeDataUrl = event.target.result;
            if (badgePreviewImg) badgePreviewImg.src = selectedBadgeDataUrl;
            if (badgeFileName) badgeFileName.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            if (badgePreviewBox) badgePreviewBox.classList.remove('hidden');
            if (adminHeroBadge) adminHeroBadge.src = selectedBadgeDataUrl;
            updateScopeText();
            if (previewContainer) previewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }

    // Main Logo Drop Zone Events
    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.add('border-slate-900', 'bg-slate-100');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.remove('border-slate-900', 'bg-slate-100');
            }, false);
        });

        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files[0]) {
                handleLogoSelect(files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleLogoSelect(e.target.files[0]);
            }
        });
    }

    // Separate Badge Drop Zone Events
    if (badgeDropZone && badgeFileInput) {
        badgeDropZone.addEventListener('click', () => badgeFileInput.click());

        badgeFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleBadgeSelect(e.target.files[0]);
            }
        });
    }

    // Cancel Button
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            selectedLogoDataUrl = null;
            selectedLogoFile = null;
            selectedBadgeDataUrl = null;
            selectedBadgeFile = null;
            if (fileInput) fileInput.value = '';
            if (badgeFileInput) badgeFileInput.value = '';
            if (badgePreviewBox) badgePreviewBox.classList.add('hidden');
            if (previewContainer) previewContainer.classList.add('hidden');
            refreshCurrentLicDisplay();
        });
    }

    // Reset Button
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            if (!confirm('Reset manufacturer logo and badge back to the official default LIC emblem?')) return;
            try {
                localStorage.removeItem('site_custom_lic_logo');
                localStorage.removeItem('site_custom_lic_badge');
                localStorage.removeItem('site_custom_lic_footer');
                if (configData) {
                    configData.licLogoUrl = '/assets/images/lic-logo-white.svg';
                    configData.licBadgeIconUrl = '/assets/images/favicon.svg';
                    configData.footerLicLogoUrl = '/assets/images/lic-logo-white.svg';
                }
                refreshCurrentLicDisplay();
                window.dispatchEvent(new CustomEvent('site-lic-logo-updated', { detail: { url: '/assets/images/lic-logo-white.svg', applyToBadge: true, applyToFooter: true } }));
                window.dispatchEvent(new CustomEvent('site-lic-badge-updated', { detail: { url: '/assets/images/favicon.svg' } }));
                window.dispatchEvent(new CustomEvent('site-lic-footer-updated', { detail: { url: '/assets/images/lic-logo-white.svg' } }));
                showStatus('lic-brand-status', 'Branding reset to official default emblems.');
            } catch (err) {
                showStatus('lic-brand-status', 'Error resetting branding: ' + err.message, true);
            }
        });
    }

    // Save & Apply Button
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            if (!selectedLogoDataUrl && !selectedBadgeDataUrl) {
                showStatus('lic-brand-status', 'Please select an image first.', true);
                return;
            }

            if (saveBtnText) saveBtnText.textContent = 'Saving Everywhere...';
            if (saveBtnSpinner) saveBtnSpinner.classList.remove('hidden');
            saveBtn.disabled = true;

            try {
                const syncBoth = (!selectedBadgeDataUrl && (!syncBothCheckbox || syncBothCheckbox.checked));

                // 1. Dev Server API Upload
                try {
                    if (selectedLogoDataUrl) {
                        await fetch('/api/upload-lic-brand', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                dataUrl: selectedLogoDataUrl,
                                targetType: syncBoth ? 'both' : 'logo',
                                applyToBoth: syncBoth,
                                filename: selectedLogoFile ? selectedLogoFile.name : 'lic-brand-logo.png'
                            })
                        });
                    }

                    if (selectedBadgeDataUrl) {
                        await fetch('/api/upload-lic-brand', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                dataUrl: selectedBadgeDataUrl,
                                targetType: 'badge',
                                applyToBoth: false,
                                filename: selectedBadgeFile ? selectedBadgeFile.name : 'lic-badge-icon.png'
                            })
                        });
                    }
                } catch (devApiErr) {
                    console.warn('Dev server upload notice:', devApiErr);
                }

                // 2. Commit directly to GitHub repository if connected
                if (GH_OWNER && GH_REPO && GH_TOKEN) {
                    try {
                        let configModified = false;
                        const timestamp = Date.now();

                        // Commit Main Logo
                        if (selectedLogoDataUrl && selectedLogoDataUrl.includes(',')) {
                            const logoBase64 = selectedLogoDataUrl.split(',')[1];
                            const isSvg = selectedLogoFile && selectedLogoFile.type && selectedLogoFile.type.includes('svg');
                            const logoExt = isSvg ? 'svg' : 'png';
                            const targetLogoPath = `public/lic-brand-logo.${logoExt}`;

                            let targetSha = null;
                            try {
                                const shaRes = await githubRequest(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${targetLogoPath}`);
                                if (shaRes.ok) {
                                    const shaData = await shaRes.json();
                                    targetSha = shaData.sha;
                                }
                            } catch (e) {}

                            const putBody = {
                                message: `Admin: Update LIC brand logo (${targetLogoPath})`,
                                content: logoBase64,
                                branch: GH_BRANCH || 'main'
                            };
                            if (targetSha) putBody.sha = targetSha;

                            await githubRequest(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${targetLogoPath}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(putBody)
                            });

                            if (configData) {
                                configData.licLogoUrl = `/lic-brand-logo.${logoExt}?v=${timestamp}`;
                                if (syncBoth) {
                                    configData.licBadgeIconUrl = `/lic-brand-logo.${logoExt}?v=${timestamp}`;
                                }
                                configModified = true;
                            }
                        }

                        // Commit Separate Badge if provided
                        if (selectedBadgeDataUrl && selectedBadgeDataUrl.includes(',')) {
                            const badgeBase64 = selectedBadgeDataUrl.split(',')[1];
                            const isSvg = selectedBadgeFile && selectedBadgeFile.type && selectedBadgeFile.type.includes('svg');
                            const badgeExt = isSvg ? 'svg' : 'png';
                            const targetBadgePath = `public/lic-badge-icon.${badgeExt}`;

                            let targetSha = null;
                            try {
                                const shaRes = await githubRequest(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${targetBadgePath}`);
                                if (shaRes.ok) {
                                    const shaData = await shaRes.json();
                                    targetSha = shaData.sha;
                                }
                            } catch (e) {}

                            const putBody = {
                                message: `Admin: Update LIC badge icon (${targetBadgePath})`,
                                content: badgeBase64,
                                branch: GH_BRANCH || 'main'
                            };
                            if (targetSha) putBody.sha = targetSha;

                            await githubRequest(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${targetBadgePath}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(putBody)
                            });

                            if (configData) {
                                configData.licBadgeIconUrl = `/lic-badge-icon.${badgeExt}?v=${timestamp}`;
                                configModified = true;
                            }
                        }

                        // Save updated config.json to GitHub
                        if (configModified && configData) {
                            configSha = await saveFileToGithub(configFilePath, JSON.stringify(configData, null, 2), 'Admin: Update licLogoUrl and licBadgeIconUrl in config.json', configSha);
                        }
                    } catch (ghErr) {
                        console.warn('GitHub brand logo sync notice:', ghErr);
                    }
                }

                // 3. Save to localStorage for immediate real-time rendering
                try {
                    if (selectedLogoDataUrl) {
                        localStorage.setItem('site_custom_lic_logo', selectedLogoDataUrl);
                        if (syncBoth) {
                            localStorage.setItem('site_custom_lic_footer', selectedLogoDataUrl);
                        }
                    }
                    if (selectedBadgeDataUrl) {
                        localStorage.setItem('site_custom_lic_badge', selectedBadgeDataUrl);
                    } else if (syncBoth && selectedLogoDataUrl) {
                        localStorage.removeItem('site_custom_lic_badge');
                    }
                } catch (e) {}

                // 4. Update live mockup previews
                refreshCurrentLicDisplay();

                // 5. Broadcast to all open pages and tabs
                if (selectedLogoDataUrl) {
                    window.dispatchEvent(new CustomEvent('site-lic-logo-updated', {
                        detail: { url: selectedLogoDataUrl, applyToBadge: syncBoth, applyToFooter: syncBoth }
                    }));
                }
                if (selectedBadgeDataUrl) {
                    window.dispatchEvent(new CustomEvent('site-lic-badge-updated', {
                        detail: { url: selectedBadgeDataUrl }
                    }));
                } else if (syncBoth && selectedLogoDataUrl) {
                    window.dispatchEvent(new CustomEvent('site-lic-badge-updated', {
                        detail: { url: selectedLogoDataUrl }
                    }));
                }

                // 6. Reset UI
                if (previewContainer) previewContainer.classList.add('hidden');
                if (fileInput) fileInput.value = '';
                if (badgeFileInput) badgeFileInput.value = '';
                selectedLogoDataUrl = null;
                selectedLogoFile = null;
                selectedBadgeDataUrl = null;
                selectedBadgeFile = null;

                showStatus('lic-brand-status', 'Images uploaded successfully! Your image is now live everywhere on the website across all marked locations.');
            } catch (error) {
                showStatus('lic-brand-status', 'Upload failed: ' + error.message, true);
            } finally {
                if (saveBtnText) saveBtnText.textContent = 'Upload & Apply Everywhere';
                if (saveBtnSpinner) saveBtnSpinner.classList.add('hidden');
                saveBtn.disabled = false;
            }
        });
    }
}

// ---- Image Upload (Base64 to GitHub) ----

function setupImageUpload() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('photo-upload');
    const previewContainer = document.getElementById('photo-preview-container');
    const previewImg = document.getElementById('photo-preview');
    const saveBtn = document.getElementById('save-photo-btn');

    let base64Image = null;

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', handleFileSelect);

    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            showStatus('photo-status', 'File is too large. Max 2MB.', true);
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            // The result looks like data:image/jpeg;base64,/9j/4AAQSk...
            const dataUrl = event.target.result;
            previewImg.src = dataUrl;
            previewContainer.classList.remove('hidden');
            
            // Extract just the base64 part for GitHub API
            base64Image = dataUrl.split(',')[1];
        };
        reader.readAsDataURL(file);
    }

    saveBtn.addEventListener('click', async () => {
        if (!base64Image) return;
        
        saveBtn.textContent = 'Uploading...';
        saveBtn.disabled = true;

        const imagePath = 'assets/images/sanchita-adhikary-barman.jpg';
        
        try {
            // First, get the current SHA of the image so we can overwrite it
            let currentSha = null;
            try {
                const res = await githubRequest(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${imagePath}`);
                if (res.ok) {
                    const data = await res.json();
                    currentSha = data.sha;
                }
            } catch(e) { /* File might not exist yet, that's fine */ }

            // Put file
            const body = {
                message: 'Admin: Update profile photograph',
                content: base64Image,
                branch: 'main'
            };
            if (currentSha) body.sha = currentSha;

            const res = await githubRequest(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${imagePath}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!res.ok) throw new Error('Failed to upload image');
            
            showStatus('photo-status', 'Photograph uploaded successfully! (It may take a minute for Cloudflare to clear cache and display it on the live site).');
        } catch (error) {
            showStatus('photo-status', error.message, true);
        } finally {
            saveBtn.textContent = 'Upload & Publish Image';
            saveBtn.disabled = false;
        }
    });
}


// ---- Achievements Editor ----
function renderAchievementsList() {
    const container = document.getElementById('achievements-list');
    container.innerHTML = '';

    achieveData.forEach((a, index) => {
        const div = document.createElement('div');
        div.className = 'p-4 border border-slate-200 rounded-lg bg-slate-50 relative group';
        div.innerHTML = `
            <button class="absolute top-2 right-2 text-red-500 hover:text-red-700 hidden group-hover:block" onclick="deleteAchievement(${index})" title="Delete">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
            <div class="space-y-3">
                <div>
                    <label class="block text-xs font-medium text-gray-500 mb-1">Title</label>
                    <input type="text" class="w-full text-sm px-2 py-1 border border-gray-300 rounded" value="${a.title || ''}" onchange="updateAchievement(${index}, 'title', this.value)">
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-500 mb-1">Description</label>
                    <textarea class="w-full text-sm px-2 py-1 border border-gray-300 rounded h-16" onchange="updateAchievement(${index}, 'description', this.value)">${a.description || ''}</textarea>
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-500 mb-1">Upload New Image <span class="text-slate-400">(Recommended: 1200×675 px landscape, max 2MB)</span></label>
                    <input type="file" accept="image/jpeg, image/png" class="w-full text-sm" onchange="uploadAchievementImage(${index}, this)">
                    <p class="text-xs text-gray-400 mt-1 truncate">Current: ${a.imagePath || 'None'}</p>
                    <div id="ach-upload-status-${index}" class="text-xs mt-1 font-medium hidden"></div>
                </div>
            </div>
        `;
        container.appendChild(div);
    });

    if(window.lucide) window.lucide.createIcons();
}

window.updateAchievement = function(index, field, value) {
    achieveData[index][field] = value;
}

window.deleteAchievement = function(index) {
    if(confirm('Remove this achievement?')) {
        achieveData.splice(index, 1);
        renderAchievementsList();
    }
}

window.uploadAchievementImage = async function(index, fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    const statusEl = document.getElementById(`ach-upload-status-${index}`);
    statusEl.classList.remove('hidden');
    statusEl.textContent = 'Uploading image...';
    statusEl.className = 'text-xs mt-1 font-medium text-blue-500';

    const reader = new FileReader();
    reader.onload = async (event) => {
        const base64Image = event.target.result.split(',')[1];
        const filename = `achieve-${Date.now()}.jpg`;
        const imagePath = `assets/images/achievements/${filename}`;
        
        try {
            const body = {
                message: `Admin: Upload achievement image ${filename}`,
                content: base64Image,
                branch: GH_BRANCH || 'main'
            };

            const res = await githubRequest(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${imagePath}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!res.ok) throw new Error('Failed to upload image');
            
            // Update the data
            achieveData[index].imagePath = imagePath;
            statusEl.textContent = 'Uploaded successfully!';
            statusEl.className = 'text-xs mt-1 font-medium text-green-500';
            
            // Re-render to show updated path
            setTimeout(renderAchievementsList, 1500);
            
        } catch (error) {
            statusEl.textContent = 'Error: ' + error.message;
            statusEl.className = 'text-xs mt-1 font-medium text-red-500';
        }
    };
    reader.readAsDataURL(file);
}

const addAchieveBtn = document.getElementById('add-achieve-btn');
if (addAchieveBtn) {
    addAchieveBtn.addEventListener('click', () => {
        achieveData.push({ id: Date.now(), imagePath: '', title: '', description: '' });
        renderAchievementsList();
    });
}

const saveAchieveBtn = document.getElementById('save-achieve-btn');
if (saveAchieveBtn) {
    saveAchieveBtn.addEventListener('click', async (e) => {
        const btn = e.target;
        btn.textContent = 'Saving...';
        btn.disabled = true;

        try {
            achieveSha = await saveFileToGithub(achieveFilePath, JSON.stringify(achieveData, null, 2), `Admin: Update ${achieveFilePath}`, achieveSha);
            showStatus('achieve-status', 'Achievements saved successfully! Changes are live on GitHub.');
        } catch (error) {
            showStatus('achieve-status', error.message, true);
        } finally {
            btn.textContent = 'Save Achievements';
            btn.disabled = false;
        }
    });
}
