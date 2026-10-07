/**
 * Google Apps Script backend for the household education survey.
 * Paste this file into the Apps Script project attached to the target Sheet,
 * or set SPREADSHEET_ID below for a standalone Apps Script project.
 */
const SPREADSHEET_ID = ""; // Optional: spreadsheet ID from its URL.
const HOUSEHOLD_SHEET_NAME = "PhieuHo";
const MEMBER_SHEET_NAME = "ThanhVien";
const MAX_MEMBERS_PER_HOUSEHOLD = 100;
const MAX_REQUEST_CHARS = 250000;

const HOUSEHOLD_FIELDS = [
  "maPhieu",
  "thoiGianTao",
  "thoiGianTiepNhan",
  "soPhieu",
  "maTinhThanh",
  "tinhThanh",
  "maPhuong",
  "phuong",
  "toDanPho",
  "soNha",
  "chuHo",
  "dienCuTru",
  "dienThoai",
  "canBoDieuTra",
  "truongThon",
  "chuHoXacNhan",
  "ghiChu",
  "ngayXacNhan"
];

const MEMBER_FIELDS = [
  "maPhieu",
  "thuTu",
  "hoTen",
  "ngaySinh",
  "gioiTinh",
  "quanHe",
  "lopDangHoc",
  "truongDangHoc",
  "trinhDo",
  "tinhTrangHoc",
  "bietChu",
  "nguoiDoDau",
  "boTuc",
  "namTotNghiep",
  "ngheBac",
  "ngheNam",
  "lopXoaMuChu",
  "namXoaMuChu",
  "boHoc",
  "namBoHoc",
  "khuyetTat",
  "dangKhuyetTat",
  "bienDong",
  "ngayBienDong",
  "noiBienDong",
  "ghiChuThanhVien"
];

/** Health check; open the deployed /exec URL to confirm deployment. */
function doGet(e) {
  const action = e && e.parameter ? String(e.parameter.action || "") : "";
  if (action === "lookup") return lookupJsonp_(e);
  return jsonResponse_({ ok: true, service: "phieu-dieu-tra", message: "Web app is running." });
}

/** Receives one household form and replaces any earlier record with the same form ID. */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(30000)) {
      throw new Error("Hệ thống đang bận. Vui lòng gửi lại sau ít phút.");
    }

    const raw = e && e.postData && e.postData.contents ? e.postData.contents : "";
    if (!raw) throw new Error("Request body bị trống.");
    if (raw.length > MAX_REQUEST_CHARS) throw new Error("Phiếu gửi lên quá lớn.");

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (_) {
      throw new Error("Dữ liệu gửi lên không phải JSON hợp lệ.");
    }

    validatePayload_(payload);
    const spreadsheet = getSpreadsheet_();
    const householdSheet = getOrCreateSheet_(spreadsheet, HOUSEHOLD_SHEET_NAME, HOUSEHOLD_FIELDS);
    const memberSheet = getOrCreateSheet_(spreadsheet, MEMBER_SHEET_NAME, MEMBER_FIELDS);
    const formId = text_(payload.maPhieu, 80);
    const household = payload.thongTinHo;
    const members = payload.thanhVien;
    const receivedAt = new Date().toISOString();

    const householdRecord = Object.assign({}, household, {
      maPhieu: formId,
      thoiGianTao: text_(payload.thoiGianTao, 80),
      thoiGianTiepNhan: receivedAt
    });
    upsertHousehold_(householdSheet, formId, householdRecord);
    replaceMembers_(memberSheet, formId, members);

    return jsonResponse_({ ok: true, maPhieu: formId, soThanhVien: members.length, receivedAt: receivedAt });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonResponse_({ ok: false, error: error && error.message ? error.message : "Không thể lưu phiếu." });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function validatePayload_(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Thiếu dữ liệu phiếu.");
  if (!payload.thongTinHo || typeof payload.thongTinHo !== "object") throw new Error("Thiếu thông tin hộ.");
  if (!Array.isArray(payload.thanhVien)) throw new Error("Danh sách thành viên không hợp lệ.");
  if (payload.thanhVien.length < 1 || payload.thanhVien.length > MAX_MEMBERS_PER_HOUSEHOLD) {
    throw new Error("Số thành viên phải từ 1 đến " + MAX_MEMBERS_PER_HOUSEHOLD + ".");
  }

  const household = payload.thongTinHo;
  if (!text_(payload.maPhieu, 80)) throw new Error("Thiếu mã phiếu.");
  if (!text_(household.tinhThanh, 150)) throw new Error("Thiếu Tỉnh / Thành phố.");
  if (!text_(household.phuong, 150)) throw new Error("Thiếu Phường / Xã.");
  if (!text_(household.chuHo, 200)) throw new Error("Thiếu họ tên chủ hộ.");

  payload.thanhVien.forEach(function (member, index) {
    if (!member || typeof member !== "object") throw new Error("Thông tin thành viên " + (index + 1) + " không hợp lệ.");
    if (!text_(member.hoTen, 200)) throw new Error("Thiếu họ tên thành viên " + (index + 1) + ".");
    if (!text_(member.ngaySinh, 30)) throw new Error("Thiếu ngày sinh thành viên " + (index + 1) + ".");
    if (!text_(member.gioiTinh, 30)) throw new Error("Thiếu giới tính thành viên " + (index + 1) + ".");
    if (!text_(member.quanHe, 80)) throw new Error("Thiếu quan hệ chủ hộ của thành viên " + (index + 1) + ".");
  });
}

function getSpreadsheet_() {
  if (SPREADSHEET_ID.trim()) return SpreadsheetApp.openById(SPREADSHEET_ID.trim());
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error("Chưa cấu hình SPREADSHEET_ID. Hãy điền ID Google Sheets vào đầu Code.gs.");
}

function getOrCreateSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  const existingHeaders = headerRange.getDisplayValues()[0];
  const matches = headers.every(function (header, index) { return existingHeaders[index] === header; });
  if (!matches) {
    headerRange.setNumberFormat("@");
    headerRange.setValues([headers]);
    headerRange.setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function upsertHousehold_(sheet, formId, record) {
  const lastRow = sheet.getLastRow();
  let rowNumber = 0;
  if (lastRow >= 2) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === formId) {
        rowNumber = i + 2;
        break;
      }
    }
  }
  if (!rowNumber) rowNumber = Math.max(2, lastRow + 1);

  const values = HOUSEHOLD_FIELDS.map(function (field) {
    return safeCellValue_(record[field], field === "ghiChu" ? 5000 : 500);
  });
  const range = sheet.getRange(rowNumber, 1, 1, values.length);
  range.setNumberFormat("@");
  range.setValues([values]);
}

function replaceMembers_(sheet, formId, members) {
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (ids[i][0] === formId) sheet.deleteRow(i + 2);
    }
  }

  if (!members.length) return;
  const rows = members.map(function (member, index) {
    const record = Object.assign({}, member, { maPhieu: formId, thuTu: index + 1 });
    return MEMBER_FIELDS.map(function (field) {
      return safeCellValue_(record[field], 500);
    });
  });
  const startRow = Math.max(2, sheet.getLastRow() + 1);
  const range = sheet.getRange(startRow, 1, rows.length, MEMBER_FIELDS.length);
  range.setNumberFormat("@");
  range.setValues(rows);
}

function text_(value, maxLength) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, maxLength || 500);
}

/** Store user-entered values as text and prevent formula injection. */
function safeCellValue_(value, maxLength) {
  let output = text_(value, maxLength);
  if (/^[=+@]/.test(output) || /^-/.test(output)) output = "'" + output;
  return output;
}

function jsonResponse_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Looks up an existing form. Requires a manager PIN stored in Script Properties. */
function lookupJsonp_(e) {
  const callback = e && e.parameter ? String(e.parameter.callback || "") : "";
  const validCallback = /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback);
  try {
    if (!validCallback) throw new Error("Callback tra cứu không hợp lệ.");
    const expectedPin = PropertiesService.getScriptProperties().getProperty("FORM_LOOKUP_PIN");
    if (!expectedPin) throw new Error("Chưa cấu hình mã quản lý FORM_LOOKUP_PIN trong Script Properties.");
    const suppliedPin = String(e.parameter.pin || "");
    if (suppliedPin !== expectedPin) throw new Error("Mã quản lý không đúng.");

    const formId = String(e.parameter.maPhieu || "").trim();
    if (!formId) throw new Error("Nhập số phiếu cần tra cứu.");

    const spreadsheet = getSpreadsheet_();
    const householdSheet = spreadsheet.getSheetByName(HOUSEHOLD_SHEET_NAME);
    const memberSheet = spreadsheet.getSheetByName(MEMBER_SHEET_NAME);
    if (!householdSheet || !memberSheet) throw new Error("Không tìm thấy tab PhieuHo hoặc ThanhVien.");

    const household = findRecordById_(householdSheet, "maPhieu", formId);
    if (!household) throw new Error("Không tìm thấy phiếu này.");
    const members = findRecordsById_(memberSheet, "maPhieu", formId);
    return jsonpResponse_(callback, { ok: true, data: {
      loaiPhieu: "Phổ cập giáo dục - Xóa mù chữ",
      maPhieu: formId,
      thoiGianTao: household.thoiGianTao || "",
      thongTinHo: household,
      thanhVien: members
    }});
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    const body = { ok: false, error: error && error.message ? error.message : "Không thể tra cứu phiếu." };
    return validCallback ? jsonpResponse_(callback, body) : jsonResponse_(body);
  }
}

function findRecordById_(sheet, idField, id) {
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return null;
  const headers = values[0];
  const idIndex = headers.indexOf(idField);
  if (idIndex < 0) return null;
  for (let row = 1; row < values.length; row++) {
    if (values[row][idIndex] !== id) continue;
    const record = {};
    headers.forEach(function (header, column) { record[header] = values[row][column]; });
    return record;
  }
  return null;
}

function findRecordsById_(sheet, idField, id) {
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const headers = values[0];
  const idIndex = headers.indexOf(idField);
  if (idIndex < 0) return [];
  const records = [];
  for (let row = 1; row < values.length; row++) {
    if (values[row][idIndex] !== id) continue;
    const record = {};
    headers.forEach(function (header, column) { record[header] = values[row][column]; });
    records.push(record);
  }
  return records;
}

function jsonpResponse_(callback, body) {
  const json = JSON.stringify(body).replace(/</g, "\\u003c");
  return ContentService.createTextOutput(callback + "(" + json + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
