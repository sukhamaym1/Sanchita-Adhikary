if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdmin);
} else {
    initAdmin();
}

let GH_OWNER = '';
let GH_REPO = '';
let GH_TOKEN = '';

let configData = {};
let configSha = '';
let configFilePath = 'data/config.json';

let testData = [];
let testSha = '';
let testFilePath = 'data/testimonials.json';

let achieveData = [];
let achieveSha = '';
let achieveFilePath = 'data/achievements.json';

// Check if already logged in via Session Storage
function initAdmin() {
    let storedOwner = null;
    let storedRepo = null;
    let storedToken = null;
    try {
        storedOwner = sessionStorage.getItem('gh_owner');
        storedRepo = sessionStorage.getItem('gh_repo');
        storedToken = sessionStorage.getItem('gh_token');
    } catch (e) {
        console.warn('SessionStorage access not available in sandbox:', e);
    }

    if (storedOwner && storedRepo && storedToken) {
        GH_OWNER = storedOwner;
        GH_REPO = storedRepo;
        GH_TOKEN = storedToken;
        showDashboard();
    }

    setupAuth();
    setupImageUpload();
}

// ---- Authentication ----

function setupAuth() {
    const authForm = document.getElementById('auth-form');
    const logoutBtn = document.getElementById('logout-btn');
    const ownerInput = document.getElementById('gh-owner');
    const repoInput = document.getElementById('gh-repo');
    const tokenInput = document.getElementById('gh-token');

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

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = authForm.querySelector('button');
        const errEl = document.getElementById('auth-error');
        if (errEl) errEl.classList.add('hidden');

        btn.textContent = 'Connecting...';
        btn.disabled = true;

        let rawOwner = ownerInput.value.trim();
        let rawRepo = repoInput.value.trim();
        GH_TOKEN = tokenInput.value.trim();

        // Sanitize owner if a URL was entered
        if (rawOwner.includes('github.com/')) {
            const clean = rawOwner.replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, '');
            const parts = clean.split('/');
            GH_OWNER = parts[0] || '';
            if (parts[1] && !rawRepo) {
                GH_REPO = parts[1].replace(/\.git$/i, '');
                repoInput.value = GH_REPO;
            } else {
                GH_REPO = rawRepo;
            }
            ownerInput.value = GH_OWNER;
        } else {
            GH_OWNER = rawOwner.replace(/^@/, '').replace(/\/+$/, '');
            GH_REPO = rawRepo.replace(/\.git$/i, '').trim();
        }

        // If repo still contains spaces or URL, clean it up
        if (GH_REPO.includes('github.com/')) {
            const cleanRepo = GH_REPO.replace(/^https?:\/\/github\.com\/[^/]+\//i, '').replace(/\/+$/, '');
            GH_REPO = cleanRepo.replace(/\.git$/i, '');
            repoInput.value = GH_REPO;
        }

        if (!GH_OWNER || !GH_REPO || !GH_TOKEN) {
            showAuthError("Please provide your GitHub Username, Repository Name, and Personal Access Token.");
            btn.textContent = 'Connect';
            btn.disabled = false;
            return;
        }

        // Validate token by fetching repo info
        try {
            const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(GH_OWNER)}/${encodeURIComponent(GH_REPO)}`, {
                headers: {
                    'Authorization': `Bearer ${GH_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (res.ok) {
                sessionStorage.setItem('gh_owner', GH_OWNER);
                sessionStorage.setItem('gh_repo', GH_REPO);
                sessionStorage.setItem('gh_token', GH_TOKEN);
                showDashboard();
            } else if (res.status === 401) {
                showAuthError("Invalid Token (401): The Personal Access Token was rejected. Check that you copied the full token without extra spaces.");
            } else if (res.status === 404) {
                showAuthError(`Repository not found (404): Could not find "${GH_OWNER}/${GH_REPO}". Check that the repository name matches GitHub exactly (case-sensitive) and that your token has the "repo" scope checked.`);
            } else if (res.status === 403) {
                showAuthError("Access Forbidden (403): Your token may lack the required 'repo' permission, or your account reached the GitHub API rate limit.");
            } else {
                showAuthError(`GitHub API error (${res.status}): Failed to connect to ${GH_OWNER}/${GH_REPO}.`);
            }
        } catch (error) {
            showAuthError(`Connection error: ${error.message || "Failed to contact GitHub API. Please check your network or browser adblocker."}`);
        } finally {
            btn.textContent = 'Connect';
            btn.disabled = false;
        }
    });

    logoutBtn.addEventListener('click', () => {
        sessionStorage.clear();
        location.reload();
    });
}

function showAuthError(msg) {
    const errEl = document.getElementById('auth-error');
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
}

function showDashboard() {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.remove('hidden');
    document.getElementById('connected-repo').textContent = `${GH_OWNER}/${GH_REPO}`;
    
    fetchSiteData();
}

// ---- GitHub API Helpers ----

async function fetchFileFromGithub(path) {
    const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, {
        headers: {
            'Authorization': `Bearer ${GH_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
        },
        cache: 'no-store' // Prevent caching old SHAs
    });
    
    if (!res.ok) throw new Error(`Failed to fetch ${path}`);
    const data = await res.json();
    
    // Decode base64 content securely
    const content = decodeURIComponent(escape(window.atob(data.content)));
    return {
        content: JSON.parse(content),
        sha: data.sha
    };
}

async function saveFileToGithub(path, contentStr, message, sha) {
    // Encode to base64 securely
    const base64Content = window.btoa(unescape(encodeURIComponent(contentStr)));
    
    const body = {
        message: message,
        content: base64Content,
        branch: 'main'
    };
    if (sha) body.sha = sha;

    const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${GH_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
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
                const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${imagePath}`, {
                    headers: { 'Authorization': `Bearer ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
                });
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

            const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${imagePath}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${GH_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json',
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
                    <label class="block text-xs font-medium text-gray-500 mb-1">Upload New Image (Auto-saves to Github and updates link)</label>
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
                branch: 'main'
            };

            const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${imagePath}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${GH_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json',
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
