import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut 
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App (reuse if already initialized)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);

// Configure Google Auth Provider with Google Workspace Scopes
export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/spreadsheets.readonly'
];

const provider = new GoogleAuthProvider();
SCOPES.forEach(scope => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'consent'
});

// In-memory token cache (NEVER in localStorage/sessionStorage)
let cachedAccessToken = null;
let isSigningIn = false;

/**
 * Initialize Google Auth State Listener
 * @param {Function} onAuthSuccess Callback when user is signed in with token
 * @param {Function} onAuthFailure Callback when user is signed out
 */
export function initGoogleAuth(onAuthSuccess, onAuthFailure) {
  return onAuthStateChanged(auth, async (user) => {
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure(user);
      }
    }
  });
}

/**
 * Trigger Google Sign In Popup
 * @returns {Promise<{user: Object, accessToken: string}>}
 */
export async function signInWithGoogle() {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Could not retrieve access token from Google sign-in.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (err) {
    console.error('Google Sign In Error:', err);
    throw err;
  } finally {
    isSigningIn = false;
  }
}

/**
 * Sign out current Google User and clear token cache
 */
export async function signOutGoogle() {
  await signOut(auth);
  cachedAccessToken = null;
}

/**
 * Retrieve cached token
 */
export function getCachedToken() {
  return cachedAccessToken;
}

export function getCurrentUser() {
  return auth.currentUser;
}

// -------------------------------------------------------------
// Google Sheets API Services
// -------------------------------------------------------------

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

/**
 * Create a new Google Spreadsheet with predefined enquiry headers
 * @param {string} title Spreadsheet title
 * @returns {Promise<Object>} Created spreadsheet object
 */
export async function createEnquirySpreadsheet(title = 'LIC Client Consultations & Enquiries') {
  if (!cachedAccessToken) {
    throw new Error('Google authentication required. Please sign in first.');
  }

  const payload = {
    properties: {
      title: title
    },
    sheets: [
      {
        properties: {
          title: 'Consultation Inquiries',
          gridProperties: {
            frozenRowCount: 1,
            columnCount: 8
          }
        },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: [
              {
                values: [
                  { userEnteredValue: { stringValue: 'Submission ID' } },
                  { userEnteredValue: { stringValue: 'Timestamp (IST)' } },
                  { userEnteredValue: { stringValue: 'Full Name' } },
                  { userEnteredValue: { stringValue: 'Mobile Number' } },
                  { userEnteredValue: { stringValue: 'Email Address' } },
                  { userEnteredValue: { stringValue: 'Service Requirement' } },
                  { userEnteredValue: { stringValue: 'Client Message / Notes' } },
                  { userEnteredValue: { stringValue: 'Status' } }
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  const response = await fetch(SHEETS_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cachedAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to create spreadsheet (${response.status}): ${errText}`);
  }

  const result = await response.json();
  return result;
}

/**
 * Add a new Sheet (Tab) to an existing Google Spreadsheet
 * @param {string} spreadsheetId 
 * @param {string} sheetTitle 
 */
export async function addNewSheetTab(spreadsheetId, sheetTitle) {
  if (!cachedAccessToken) {
    throw new Error('Google authentication required.');
  }

  const batchUpdateUrl = `${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`;
  const payload = {
    requests: [
      {
        addSheet: {
          properties: {
            title: sheetTitle,
            gridProperties: {
              frozenRowCount: 1
            }
          }
        }
      }
    ]
  };

  const response = await fetch(batchUpdateUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cachedAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to add new sheet tab: ${errText}`);
  }

  // Add headers to new sheet
  await appendRowToSpreadsheet(spreadsheetId, sheetTitle, [
    'Submission ID',
    'Timestamp (IST)',
    'Full Name',
    'Mobile Number',
    'Email Address',
    'Service Requirement',
    'Client Message / Notes',
    'Status'
  ]);

  return await response.json();
}

/**
 * Append a row of submission data to a Google Sheet
 * @param {string} spreadsheetId 
 * @param {string} sheetName 
 * @param {Array<string>} rowValues 
 */
export async function appendRowToSpreadsheet(spreadsheetId, sheetName, rowValues) {
  if (!cachedAccessToken) {
    throw new Error('Google authentication required.');
  }

  const encodedSheetName = encodeURIComponent(sheetName);
  const appendUrl = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodedSheetName}!A:H:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const response = await fetch(appendUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cachedAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      values: [rowValues]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to append row to Google Sheet: ${errText}`);
  }

  return await response.json();
}

/**
 * Fetch spreadsheet metadata to check title and sheet names
 * @param {string} spreadsheetId 
 */
export async function getSpreadsheetDetails(spreadsheetId) {
  if (!cachedAccessToken) {
    throw new Error('Google authentication required.');
  }

  const url = `${SHEETS_API_BASE}/${spreadsheetId}?fields=properties.title,sheets.properties`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${cachedAccessToken}`
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Could not access spreadsheet (${response.status}): ${errText}`);
  }

  return await response.json();
}

/**
 * Fetch recent rows from a Google Sheet
 * @param {string} spreadsheetId 
 * @param {string} sheetName 
 * @param {number} maxRows 
 */
export async function getRecentSubmissionsFromSheet(spreadsheetId, sheetName = 'Consultation Inquiries', maxRows = 10) {
  if (!cachedAccessToken) return [];

  try {
    const encodedSheetName = encodeURIComponent(sheetName);
    const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodedSheetName}!A2:H100`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${cachedAccessToken}` }
    });

    if (!res.ok) return [];
    const data = await res.json();
    const rows = data.values || [];
    return rows.slice(-maxRows).reverse();
  } catch (e) {
    console.warn('Could not fetch recent rows from sheet:', e);
    return [];
  }
}

export const DEFAULT_SPREADSHEET_ID = '1yiQYarJpyUyIjgbE4QYRQq0SGOwozGC4Me8-CD70O0o';
export const DEFAULT_SHEET_TAB = 'Consultation Inquiries';
export const DEFAULT_SPREADSHEET_NAME = 'LIC Client Consultations & Enquiries';

export function extractSpreadsheetId(input) {
  if (!input) return '';
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return input.trim();
}

/**
 * Ensure a specific sheet tab exists and is formatted with headers
 * @param {string} spreadsheetId 
 * @param {string} tabTitle 
 */
export async function ensureSheetTabInitialized(spreadsheetId, tabTitle = DEFAULT_SHEET_TAB) {
  if (!cachedAccessToken) {
    throw new Error('Google authentication required.');
  }

  const details = await getSpreadsheetDetails(spreadsheetId);
  const spreadsheetTitle = details?.properties?.title || DEFAULT_SPREADSHEET_NAME;
  const existingSheets = details?.sheets || [];
  const tabExists = existingSheets.some(s => s.properties?.title?.toLowerCase() === tabTitle.toLowerCase());

  if (!tabExists) {
    // Add the sheet tab with frozen top header
    await addNewSheetTab(spreadsheetId, tabTitle);
  } else {
    // Check if header row exists
    try {
      const encodedTab = encodeURIComponent(tabTitle);
      const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodedTab}!A1:H1`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${cachedAccessToken}` }
      });
      if (res.ok) {
        const valData = await res.json();
        if (!valData.values || valData.values.length === 0 || !valData.values[0] || valData.values[0].length === 0) {
          // Add header row
          await appendRowToSpreadsheet(spreadsheetId, tabTitle, [
            'Submission ID',
            'Timestamp (IST)',
            'Full Name',
            'Mobile Number',
            'Email Address',
            'Service Requirement',
            'Client Message / Notes',
            'Status'
          ]);
        }
      }
    } catch (e) {
      console.warn('Could not inspect tab headers:', e);
    }
  }

  saveStoredSpreadsheetConfig(spreadsheetId, spreadsheetTitle, tabTitle);
  return { spreadsheetId, spreadsheetTitle, tabTitle };
}

// -------------------------------------------------------------
// Offline Queue / Storage Helpers
// -------------------------------------------------------------

const STORAGE_SHEET_ID_KEY = 'lic_connected_spreadsheet_id';
const STORAGE_SHEET_NAME_KEY = 'lic_connected_spreadsheet_name';
const STORAGE_SHEET_TAB_KEY = 'lic_connected_sheet_tab';
const STORAGE_PENDING_QUEUE_KEY = 'lic_pending_enquiries_queue';

export function getStoredSpreadsheetConfig() {
  return {
    id: localStorage.getItem(STORAGE_SHEET_ID_KEY) || DEFAULT_SPREADSHEET_ID,
    name: localStorage.getItem(STORAGE_SHEET_NAME_KEY) || DEFAULT_SPREADSHEET_NAME,
    tab: localStorage.getItem(STORAGE_SHEET_TAB_KEY) || DEFAULT_SHEET_TAB
  };
}

export function saveStoredSpreadsheetConfig(id, name, tab = 'Consultation Inquiries') {
  if (id) localStorage.setItem(STORAGE_SHEET_ID_KEY, id);
  if (name) localStorage.setItem(STORAGE_SHEET_NAME_KEY, name);
  if (tab) localStorage.setItem(STORAGE_SHEET_TAB_KEY, tab);
}

export function clearStoredSpreadsheetConfig() {
  localStorage.removeItem(STORAGE_SHEET_ID_KEY);
  localStorage.removeItem(STORAGE_SHEET_NAME_KEY);
  localStorage.removeItem(STORAGE_SHEET_TAB_KEY);
}

export function getPendingQueue() {
  try {
    const saved = localStorage.getItem(STORAGE_PENDING_QUEUE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
}

export function enqueuePendingSubmission(submission) {
  const queue = getPendingQueue();
  queue.push({
    ...submission,
    id: 'ENQ-' + Math.floor(100000 + Math.random() * 900000),
    enqueuedAt: new Date().toISOString()
  });
  localStorage.setItem(STORAGE_PENDING_QUEUE_KEY, JSON.stringify(queue));
  return queue;
}

export function clearPendingQueue() {
  localStorage.setItem(STORAGE_PENDING_QUEUE_KEY, JSON.stringify([]));
}
