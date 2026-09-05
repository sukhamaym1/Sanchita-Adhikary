/**
 * =========================================================================
 * LIC ADVISOR WEBSITE - GOOGLE SHEETS BACKEND CONNECTOR
 * =========================================================================
 * 
 * Target Spreadsheet:
 * https://docs.google.com/spreadsheets/d/1yiQYarJpyUyIjgbE4QYRQq0SGOwozGC4Me8-CD70O0o/edit
 * 
 * INSTRUCTIONS TO CONNECT:
 * 1. Open your Google Sheet in your web browser:
 *    https://docs.google.com/spreadsheets/d/1yiQYarJpyUyIjgbE4QYRQq0SGOwozGC4Me8-CD70O0o/edit
 * 
 * 2. In the top menu of Google Sheets, click on "Extensions" -> "Apps Script".
 * 
 * 3. Delete any code already in the editor and PASTE THIS ENTIRE SCRIPT.
 * 
 * 4. Click the Save icon (Floppy disk / Ctrl+S).
 * 
 * 5. Click the blue "Deploy" button (top right) -> select "New deployment".
 * 
 * 6. Click the gear icon next to "Select type" and choose "Web app":
 *    - Description: "LIC Website Form Backend"
 *    - Execute as: "Me (your google account)"
 *    - Who has access: "Anyone" (VERY IMPORTANT: Choose "Anyone" so website visitors can submit)
 * 
 * 7. Click "Deploy". Grant Google Permissions if prompted.
 * 
 * 8. Copy the generated "Web app URL" (ends in /exec).
 * 
 * 9. Paste that Web app URL into config.json under "googleAppsScriptUrl".
 * =========================================================================
 */

var SHEET_NAME = "Consultation Inquiries";

function doPost(e) {
  try {
    var rawData = e.postData.contents;
    var data;
    
    try {
      data = JSON.parse(rawData);
    } catch (parseError) {
      data = e.parameter || {};
    }

    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName(SHEET_NAME);

    // Create the tab if it does not exist yet
    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAME);
      var headerRow = [
        "Inquiry ID",
        "Submission Date & Time",
        "Full Name",
        "Mobile Number",
        "Email ID",
        "Service Required",
        "Client Message",
        "Status"
      ];
      sheet.appendRow(headerRow);
      
      // Style the header row
      var headerRange = sheet.getRange(1, 1, 1, headerRow.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#0F2942");
      headerRange.setFontColor("#FDB913");
      sheet.setFrozenRows(1);
    }

    var id = data.id || ("LIC-" + new Date().getTime().toString().slice(-6));
    var timestamp = data.timestamp || Utilities.formatDate(new Date(), "Asia/Kolkata", "dd MMM yyyy, hh:mm a");
    var name = (data.name || "").toString().trim();
    var mobile = (data.mobile || "").toString().trim();
    var email = (data.email || "").toString().trim();
    var requirement = (data.requirement || "General Consultation").toString().trim();
    var message = (data.message || "No message provided").toString().trim();
    var status = data.status || "New Enquiry";

    // Format mobile number as text in sheet
    var formattedMobile = "'" + mobile;

    sheet.appendRow([
      id,
      timestamp,
      name,
      formattedMobile,
      email,
      requirement,
      message,
      status
    ]);

    // Optional: Format status cell
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 8).setFontColor("#15803d").setFontWeight("bold");

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Consultation inquiry appended successfully",
      id: id
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Test function: visiting the Web App URL in browser confirms it is live
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "active",
    message: "LIC Website Backend Google Sheets Web App is active and ready to receive submissions."
  })).setMimeType(ContentService.MimeType.JSON);
}
