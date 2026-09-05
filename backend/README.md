# Backend Integration: Google Sheets Sync

This folder contains the backend integration code that connects the website's consultation form directly to your Google Sheet without requiring website visitors to log in.

## Files
- `google-apps-script.js`: The Google Apps Script code deployed to your Google Sheet. It listens for consultation form submissions and appends them as new rows into your Google Sheet tab ("Consultation Inquiries").

## Configuration
- Your Google Apps Script Web App URL is configured in `data/config.json` under `"googleAppsScriptUrl"`.
- Target Spreadsheet: `https://docs.google.com/spreadsheets/d/1yiQYarJpyUyIjgbE4QYRQq0SGOwozGC4Me8-CD70O0o/edit`
