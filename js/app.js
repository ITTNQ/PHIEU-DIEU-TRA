/* =========================================================
   Phiếu điều tra phổ cập giáo dục - Xóa mù chữ
   Thêm thành viên, kiểm tra dữ liệu, lưu bản nháp, xuất JSON.

   Kết nối Google Sheets:
   1. Triển khai Google Apps Script dưới dạng Web app.
   2. Dán URL Web app vào API_URL trong js/api.js.
   3. Web app cần nhận POST JSON và ghi dữ liệu vào Google Sheets.
   ========================================================= */
(function () {
    "use strict";

    // Để trống nếu chưa triển khai Apps Script. Khi đó dữ liệu được giữ
    // trong trình duyệt và có thể tải xuống thành tệp JSON.
    const STORAGE_KEY = "phieuDieuTraPhoCap:v1";

    const householdFieldIds = [
        "soPhieu", "tinhThanh", "phuong", "toDanPho", "soNha", "chuHo",
        "dienCuTru", "dienThoai", "canBoDieuTra", "truongThon",
        "chuHoXacNhan", "ghiChu", "ngayXacNhan"
    ];

    const memberList = document.getElementById("memberList");
    const addTopButton = document.getElementById("btnThemThanhVien");
    const addBottomButton = document.getElementById("btnThemThanhVienBottom");
    const saveButton = document.getElementById("btnLuu");
    const resetButton = document.getElementById("btnLamMoi");

    if (!memberList || !saveButton || !resetButton) return;

    let nextMemberId = 1;
    let loadedCreatedAt = "";
    let modalInstance = null;

    function todayStamp() {
        const now = new Date();
        return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("");
    }

    function makeFormNumber() {
        const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
        return `PCGD-${todayStamp()}-${suffix}`;
    }

    function setInitialFormNumber() {
        const numberField = document.getElementById("soPhieu");
        if (numberField && !numberField.value.trim()) numberField.value = makeFormNumber();
    }

    function showMessage(title, message) {
        const titleNode = document.getElementById("messageTitle");
        const bodyNode = document.getElementById("messageBody");
        const modalNode = document.getElementById("messageModal");

        if (titleNode) titleNode.textContent = title;
        if (bodyNode) bodyNode.textContent = message;

        if (modalNode && window.bootstrap && window.bootstrap.Modal) {
            modalInstance = modalInstance || window.bootstrap.Modal.getOrCreateInstance(modalNode);
            modalInstance.show();
        } else {
            window.alert(`${title}\n\n${message}`);
        }
    }

    function makeSelectOptions(options) {
        return options.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
    }

    function addField(container, label, fieldName, type, options, placeholder, columnClass) {
        const wrapper = document.createElement("div");
        wrapper.className = columnClass || "col-md-4 col-sm-6";
        const id = `member-${nextMemberId}-${fieldName}`;
        let control;

        if (type === "select") {
            control = document.createElement("select");
            control.className = "form-select";
            control.innerHTML = `<option value="">-- Chọn --</option>${makeSelectOptions(options)}`;
        } else {
            control = document.createElement("input");
            control.type = type;
            control.className = "form-control";
            if (type === "date") control.max = new Date().toISOString().slice(0, 10);
        }
        if (placeholder) control.placeholder = placeholder;

        control.id = id;
        control.name = fieldName;
        control.dataset.field = fieldName;
        control.required = ["hoTen", "ngaySinh", "gioiTinh", "quanHe"].includes(fieldName);
        control.setAttribute("aria-label", label);

        const labelNode = document.createElement("label");
        labelNode.className = `form-label${control.required ? " required" : ""}`;
        labelNode.htmlFor = id;
        labelNode.textContent = label;
        wrapper.append(labelNode, control);
        container.appendChild(wrapper);
    }

    function addMemberSection(container, title, description) {
        const section = document.createElement("section");
        section.className = "col-12 member-input-section";
        const heading = document.createElement("div");
        heading.className = "member-subsection-heading";
        const titleNode = document.createElement("h4");
        titleNode.textContent = title;
        heading.appendChild(titleNode);
        if (description) {
            const note = document.createElement("p");
            note.textContent = description;
            heading.appendChild(note);
        }
        const fields = document.createElement("div");
        fields.className = "row g-3";
        section.append(heading, fields);
        container.appendChild(section);
        return fields;
    }

    function addMember(initialData) {
        const id = nextMemberId++;
        const card = document.createElement("section");
        card.className = "member-card";
        card.dataset.memberId = String(id);
        card.setAttribute("aria-label", `Thành viên ${memberList.children.length + 1}`);

        const header = document.createElement("div");
        header.className = "card-header d-flex justify-content-between align-items-center gap-2";

        const heading = document.createElement("h3");
        heading.className = "member-title mb-0";
        heading.textContent = `THÀNH VIÊN ${memberList.children.length + 1}`;

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "btn btn-outline-danger btn-sm";
        removeButton.dataset.action = "remove-member";
        removeButton.textContent = "Xóa thành viên";
        removeButton.setAttribute("aria-label", `Xóa thành viên ${memberList.children.length + 1}`);
        header.append(heading, removeButton);

        const fields = document.createElement("div");
        fields.className = "row g-3";

        const personalFields = addMemberSection(fields, "1. Thông tin cá nhân", "Ghi họ tên theo thứ tự người lớn tuổi trước, như trên phiếu giấy.");
        addField(personalFields, "Họ và tên", "hoTen", "text", null, null, "col-md-6");
        addField(personalFields, "Ngày sinh", "ngaySinh", "date", null, null, "col-md-3");
        addField(personalFields, "Giới tính", "gioiTinh", "select", [["Nam", "Nam"], ["Nữ", "Nữ"]], null, "col-md-3");
        addField(personalFields, "Quan hệ với chủ hộ", "quanHe", "select", [
            ["Chủ hộ", "Chủ hộ"], ["Vợ/Chồng", "Vợ / Chồng"], ["Con", "Con"],
            ["Cha/Mẹ", "Cha / Mẹ"], ["Ông/Bà", "Ông / Bà"], ["Anh/Chị/Em", "Anh / Chị / Em"], ["Khác", "Khác"]
        ], null, "col-md-4");
        addField(personalFields, "Cha, mẹ hoặc người đỡ đầu", "nguoiDoDau", "text", null, null, "col-md-8");

        const currentStudyFields = addMemberSection(fields, "2. Học tập hiện tại", "Điền lớp và trường đang học ở thời điểm điều tra.");
        addField(currentStudyFields, "Lớp đang học", "lopDangHoc", "text", null, null, "col-md-4");
        addField(currentStudyFields, "Trường đang học", "truongDangHoc", "text", null, null, "col-md-8");

        const completionFields = addMemberSection(fields, "3. Kết quả học tập đã hoàn thành", "Các mục không áp dụng có thể để trống.");
        addField(completionFields, "Cấp học cao nhất đã hoàn thành", "trinhDo", "select", [
            ["Chưa đi học", "Chưa đi học"], ["Mầm non", "Mầm non"], ["Tiểu học", "Tiểu học"],
            ["THCS", "Trung học cơ sở"], ["THPT", "Trung học phổ thông"], ["Trung cấp", "Trung cấp"],
            ["Cao đẳng", "Cao đẳng"], ["Đại học trở lên", "Đại học trở lên"]
        ], null, null, "col-md-5");
        addField(completionFields, "Hình thức bổ túc", "boTuc", "select", [["Không", "Không"], ["Có", "Có"]], null, "col-md-3");
        addField(completionFields, "Năm hoàn thành cấp học", "namTotNghiep", "number", null, "Ví dụ: 2025", "col-md-4");
        addField(completionFields, "Bậc đào tạo nghề", "ngheBac", "text", null, null, "col-md-6");
        addField(completionFields, "Năm tốt nghiệp nghề", "ngheNam", "number", null, "Ví dụ: 2025", "col-md-3");
        addField(completionFields, "Lớp / kỳ xóa mù chữ đã hoàn thành", "lopXoaMuChu", "text", null, null, "col-md-6");
        addField(completionFields, "Năm hoàn thành xóa mù chữ", "namXoaMuChu", "number", null, "Ví dụ: 2025", "col-md-3");

        const statusFields = addMemberSection(fields, "4. Tình trạng hiện tại", "Ghi riêng tình trạng học, việc bỏ học và thông tin khuyết tật nếu có.");
        addField(statusFields, "Tình trạng học tập", "tinhTrangHoc", "select", [
            ["Đang học", "Đang đi học"], ["Nghỉ học", "Đã nghỉ học"], ["Chưa đi học", "Chưa đi học"], ["Khác", "Khác"]
        ], null, "col-md-4");
        addField(statusFields, "Biết chữ", "bietChu", "select", [["Có", "Có"], ["Không", "Không"]], null, "col-md-4");
        addField(statusFields, "Đã bỏ học", "boHoc", "select", [["Không", "Không"], ["Có", "Có"]], null, "col-md-4");
        addField(statusFields, "Năm bỏ học (nếu có)", "namBoHoc", "number", null, "Ví dụ: 2025", "col-md-4");
        addField(statusFields, "Khuyết tật", "khuyetTat", "select", [["Không", "Không"], ["Có", "Có"]], null, "col-md-4");
        addField(statusFields, "Dạng khuyết tật / ghi rõ", "dangKhuyetTat", "text", null, null, "col-md-4");

        const movementFields = addMemberSection(fields, "5. Thay đổi nơi cư trú và ghi chú", "Chọn chuyển đến, chuyển đi hoặc đã chết nếu có biến động.");
        addField(movementFields, "Biến động", "bienDong", "select", [
            ["Không", "Không"], ["Chuyển đến", "Chuyển đến"], ["Chuyển đi", "Chuyển đi"], ["Đã chết", "Đã chết"]
        ], null, "col-md-4");
        addField(movementFields, "Ngày biến động", "ngayBienDong", "date", null, null, "col-md-4");
        addField(movementFields, "Nơi chuyển đến / chuyển đi", "noiBienDong", "text", null, null, "col-md-4");
        addField(movementFields, "Ghi chú thành viên", "ghiChuThanhVien", "text", null, null, "col-12");

        card.append(header, fields);
        memberList.appendChild(card);
        renumberMembers();

        if (initialData) {
            Object.entries(initialData).forEach(([key, value]) => {
                const field = card.querySelector(`[data-field="${key}"]`);
                if (field && value != null) field.value = String(value);
            });
        }
        return card;
    }

    function renumberMembers() {
        [...memberList.children].forEach((card, index) => {
            const number = index + 1;
            card.setAttribute("aria-label", `Thành viên ${number}`);
            const heading = card.querySelector(".member-title");
            const remove = card.querySelector('[data-action="remove-member"]');
            if (heading) heading.textContent = `THÀNH VIÊN ${number}`;
            if (remove) remove.setAttribute("aria-label", `Xóa thành viên ${number}`);
        });
    }

    function readField(id) {
        const node = document.getElementById(id);
        return node ? node.value.trim() : "";
    }

    function collectPayload() {
        const household = {};
        householdFieldIds.forEach((id) => { household[id] = readField(id); });
        household.maTinhThanh = document.querySelector("#tinhThanh option:checked")?.dataset.code || "";
        household.maPhuong = document.querySelector("#phuong option:checked")?.dataset.code || "";
        const members = [...memberList.querySelectorAll(".member-card")].map((card, index) => {
            const member = { thuTu: index + 1 };
            card.querySelectorAll("[data-field]").forEach((field) => {
                member[field.dataset.field] = field.value.trim();
            });
            return member;
        });
        return {
            loaiPhieu: "Phổ cập giáo dục - Xóa mù chữ",
            maPhieu: household.soPhieu || makeFormNumber(),
            thoiGianTao: loadedCreatedAt || new Date().toISOString(),
            thongTinHo: household,
            thanhVien: members
        };
    }

    function validateForm() {
        document.querySelectorAll(".is-invalid").forEach((node) => node.classList.remove("is-invalid"));
        const problems = [];
        const requiredHouseholdIds = ["tinhThanh", "phuong", "chuHo"];
        requiredHouseholdIds.forEach((id) => {
            const field = document.getElementById(id);
            if (field && !field.value.trim()) {
                field.classList.add("is-invalid");
                problems.push(id === "tinhThanh" ? "Chọn Tỉnh / Thành phố." : id === "phuong" ? "Chọn Phường / Xã." : "Nhập họ và tên chủ hộ.");
            }
        });

        if (memberList.children.length === 0) {
            problems.push("Thêm ít nhất một thành viên trong hộ.");
        }
        memberList.querySelectorAll(".member-card").forEach((card, index) => {
            card.querySelectorAll("[required]").forEach((field) => {
                if (!field.value.trim()) {
                    field.classList.add("is-invalid");
                    problems.push(`Điền ${field.getAttribute("aria-label").toLowerCase()} cho thành viên ${index + 1}.`);
                }
            });
        });

        const phone = document.getElementById("dienThoai");
        if (phone && phone.value.trim() && !/^[+\d\s().-]{8,20}$/.test(phone.value.trim())) {
            phone.classList.add("is-invalid");
            problems.push("Số điện thoại chưa đúng định dạng.");
        }

        if (problems.length) {
            const firstInvalid = document.querySelector(".is-invalid");
            if (firstInvalid) {
                firstInvalid.focus({ preventScroll: true });
                firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            showMessage("Kiểm tra lại thông tin", problems.slice(0, 6).join(" "));
            return false;
        }
        return true;
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>\"']/g, (character) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
        })[character]);
    }

    function householdDisplay(id) {
        const field = document.getElementById(id);
        if (!field) return "";
        if (field.tagName === "SELECT") {
            const option = field.options[field.selectedIndex];
            return option && option.value ? option.textContent.trim() : "";
        }
        return field.value.trim();
    }

    function displayDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return value || "";
        const [year, month, day] = value.split("-");
        return `${day}/${month}/${year}`;
    }

    function printTable(members, start, count) {
        const joined = (...values) => values.filter(Boolean).join(" / ");
        const rows = Array.from({ length: count }, (_, offset) => {
            const member = members[start + offset];
            if (!member) return `<tr><td>${start + offset + 1}</td>${"<td></td>".repeat(15)}</tr>`;
            return `<tr><td>${member.stt}</td><td class="print-name">${escapeHtml(member.hoTen)}</td>
                <td>${escapeHtml(member.quanHe)}</td><td>${escapeHtml(member.ngaySinh)}</td><td>${escapeHtml(member.gioiTinh)}</td>
                <td>${escapeHtml(member.nguoiDoDau)}</td><td>${escapeHtml(member.lopDangHoc)}</td><td>${escapeHtml(member.truongDangHoc)}</td>
                <td>${escapeHtml(joined(member.trinhDo, member.boTuc === "Có" ? "Bổ túc" : "", member.namTotNghiep))}</td>
                <td>${escapeHtml(joined(member.ngheBac, member.ngheNam))}</td>
                <td>${escapeHtml(joined(member.lopXoaMuChu, member.namXoaMuChu))}</td>
                <td>${escapeHtml(joined(member.tinhTrangHoc, member.boHoc === "Có" ? `Bỏ học ${member.namBoHoc || ""}` : ""))}</td>
                <td>${escapeHtml(member.bietChu)}</td><td>${escapeHtml(joined(member.khuyetTat, member.dangKhuyetTat))}</td>
                <td>${escapeHtml(joined(member.bienDong, member.ngayBienDong, member.noiBienDong))}</td>
                <td>${escapeHtml(member.ghiChuThanhVien)}</td></tr>`;
        }).join("");
        return `<table class="print-members"><thead><tr>
            <th>STT</th><th>Họ và tên đối tượng<br><small>(lớn tuổi ghi trước)</small></th><th>Quan hệ<br>với chủ hộ</th>
            <th>Ngày sinh</th><th>Giới tính</th><th>Cha, mẹ / người đỡ đầu</th><th>Lớp đang học</th><th>Trường đang học</th>
            <th>Tốt nghiệp MN–THPT<br><small>Cấp học / bổ túc / năm</small></th><th>Tốt nghiệp nghề<br><small>Bậc / năm</small></th>
            <th>Học xong xóa mù chữ<br><small>Lớp hoặc kỳ / năm</small></th><th>Tình trạng / bỏ học</th>
            <th>Biết chữ</th><th>Khuyết tật</th><th>Chuyển đến / đi, chết</th><th>Ghi chú</th>
            </tr></thead><tbody>${rows}</tbody></table>`;
    }

    function buildPrintPages() {
        const pages = document.getElementById("printPages");
        if (!pages) return;
        const members = [...memberList.querySelectorAll(".member-card")].map((card, index) => {
            const member = { stt: index + 1 };
            card.querySelectorAll("[data-field]").forEach((field) => { member[field.dataset.field] = field.value.trim(); });
            return member;
        });
        const pageCount = Math.max(2, 1 + Math.ceil(Math.max(0, members.length - 3) / 4));
        const household = (label, id) => `<div><b>${label}:</b> ${escapeHtml(householdDisplay(id))}</div>`;
        let html = `<section class="print-sheet">
            <header class="print-title"><strong>PHIẾU ĐIỀU TRA PHỔ CẬP GIÁO DỤC - XÓA MÙ CHỮ</strong><span>Trang 1/${pageCount}</span></header>
            <div class="print-household">${household("Phường / Xã", "phuong")}${household("TDP", "toDanPho")}${household("Địa chỉ", "soNha")}
                ${household("Chủ hộ", "chuHo")}${household("Số phiếu", "soPhieu")}${household("Diện cư trú", "dienCuTru")}${household("Điện thoại", "dienThoai")}</div>
            ${printTable(members, 0, 3)}
        </section>`;
        for (let page = 1; page < pageCount; page += 1) {
            const start = 3 + (page - 1) * 4;
            const lastPage = page === pageCount - 1;
            html += `<section class="print-sheet"><header class="print-title"><strong>PHIẾU ĐIỀU TRA PHỔ CẬP GIÁO DỤC - XÓA MÙ CHỮ <small>(tiếp theo)</small></strong><span>Trang ${page + 1}/${pageCount}</span></header>
                ${printTable(members, start, 4)}${lastPage ? `<div class="print-signatures">
                <div><b>Cán bộ, nhân viên điều tra</b><br><br><br>${escapeHtml(householdDisplay("canBoDieuTra"))}</div>
                <div><b>Trưởng thôn, bản, tổ dân phố</b><br><br><br>${escapeHtml(householdDisplay("truongThon"))}</div>
                <div><b>Chủ hộ gia đình</b><br><br><br>${escapeHtml(householdDisplay("chuHoXacNhan") || householdDisplay("chuHo"))}</div>
                <div><b>Xác nhận của UBND phường</b><br><br><br>Ngày ${escapeHtml(displayDate(householdDisplay("ngayXacNhan") || "...... tháng ...... năm ........"))}</div></div>` : ""}</section>`;
        }
        pages.innerHTML = html;
    }

    function printForm() {
        buildPrintPages();
        window.print();
    }

    function downloadJson(payload) {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${payload.maPhieu || "phieu-dieu-tra"}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function saveLocally(payload) {
        let records = [];
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
            if (Array.isArray(stored)) records = stored;
        } catch (_) {
            records = [];
        }
        const existingIndex = records.findIndex((record) => record.maPhieu === payload.maPhieu);
        if (existingIndex >= 0) records[existingIndex] = payload;
        else records.push(payload);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    }

    async function submitToSheets(payload) {
        return window.FormApi.submit(payload);
    }

    function populateFormFromRecord(record) {
        const household = record.thongTinHo || {};
        loadedCreatedAt = household.thoiGianTao || record.thoiGianTao || "";

        householdFieldIds.forEach((id) => {
            const field = document.getElementById(id);
            if (field && household[id] !== undefined) field.value = household[id];
            if (field) field.classList.remove("is-invalid");
        });

        const province = document.getElementById("tinhThanh");
        const ward = document.getElementById("phuong");
        if (province && household.tinhThanh) {
            province.value = household.tinhThanh;
            province.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (ward && household.phuong) ward.value = household.phuong;

        memberList.replaceChildren();
        nextMemberId = 1;
        (record.thanhVien || []).forEach((member) => addMember(member));

        const status = document.getElementById("lookupStatus");
        if (status) {
            status.textContent = `Đã tải phiếu ${record.maPhieu || household.soPhieu}. Chỉnh sửa thông tin rồi nhấn LƯU PHIẾU để cập nhật.`;
            status.classList.remove("text-danger");
            status.classList.add("text-success");
        }
        document.querySelector(".page-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
        showMessage("Đã tải phiếu", "Bạn có thể chỉnh sửa thông tin. Nhấn LƯU PHIẾU để cập nhật bản ghi này.");
    }

    async function lookupExistingForm() {
        const idField = document.getElementById("lookupSoPhieu");
        const pinField = document.getElementById("lookupPin");
        const button = document.getElementById("btnTimPhieu");
        const status = document.getElementById("lookupStatus");
        const maPhieu = idField ? idField.value.trim() : "";
        const pin = pinField ? pinField.value.trim() : "";

        if (!maPhieu || !pin) {
            showMessage("Thiếu thông tin tra cứu", "Nhập số phiếu và mã quản lý trước khi tra cứu.");
            return;
        }
        if (!window.FormApi || !window.FormApi.isConfigured()) {
            showMessage("Chưa cấu hình API", "Chưa có URL Apps Script để tra cứu phiếu.");
            return;
        }

        const originalText = button ? button.textContent : "TRA CỨU PHIẾU";
        if (button) {
            button.disabled = true;
            button.textContent = "ĐANG TRA CỨU…";
        }
        if (status) {
            status.textContent = "Đang tra cứu phiếu…";
            status.classList.remove("text-danger", "text-success");
            status.classList.add("text-muted");
        }

        try {
            const result = await window.FormApi.lookup(maPhieu, pin);
            if (!result || !result.ok || !result.data) throw new Error(result && result.error ? result.error : "Không tìm thấy phiếu.");
            populateFormFromRecord(result.data);
            if (pinField) pinField.value = "";
        } catch (error) {
            if (status) {
                status.textContent = error.message || "Không tra cứu được phiếu.";
                status.classList.remove("text-muted", "text-success");
                status.classList.add("text-danger");
            }
            showMessage("Không tra cứu được phiếu", error.message || "Hãy kiểm tra số phiếu, mã quản lý và kết nối.");
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = originalText;
            }
        }
    }
    async function saveForm() {
        if (!validateForm()) return;
        const payload = collectPayload();
        const originalLabel = saveButton.textContent;
        saveButton.disabled = true;
        saveButton.textContent = "ĐANG LƯU…";

        try {
            saveLocally(payload);
            if (window.FormApi && window.FormApi.isConfigured()) {
                const result = await submitToSheets(payload);
                if (result.sent) {
                    showMessage("Gửi thành công", "Phiếu đã được gửi thành công.");
                } else {
                    downloadJson(payload);
                    showMessage("Chưa gửi được lên Google Sheets", "Phiếu vẫn được lưu trên trình duyệt và tải xuống dạng JSON. Kiểm tra kết nối hoặc URL Web app rồi thử lại.");
                }
            } else {
                downloadJson(payload);
                showMessage("Đã lưu phiếu", "Phiếu đã được lưu trên trình duyệt này và tải xuống dưới dạng JSON. Sau khi triển khai Google Apps Script, dán URL Web app vào js/api.js để gửi lên Google Sheets.");
            }
        } catch (error) {
            console.error("Không thể lưu phiếu:", error);
            showMessage("Chưa lưu được phiếu", "Trình duyệt không lưu được dữ liệu. Hãy kiểm tra dung lượng lưu trữ hoặc thử lại.");
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = originalLabel;
        }
    }

    function resetForm() {
        const confirmed = window.confirm("Làm mới phiếu hiện tại? Dữ liệu đang nhập trên màn hình sẽ bị xóa.");
        if (!confirmed) return;
        document.querySelectorAll("#soPhieu, #tinhThanh, #phuong, #toDanPho, #soNha, #chuHo, #dienCuTru, #dienThoai, #canBoDieuTra, #truongThon, #chuHoXacNhan, #ghiChu, #ngayXacNhan")
            .forEach((field) => { field.value = ""; field.classList.remove("is-invalid"); });
        memberList.replaceChildren();
        nextMemberId = 1;
        loadedCreatedAt = "";
        setInitialFormNumber();
        showMessage("Đã làm mới", "Phiếu mới đã sẵn sàng để nhập.");
    }

    if (addTopButton) addTopButton.addEventListener("click", () => addMember());
    if (addBottomButton) addBottomButton.addEventListener("click", () => addMember());
    saveButton.addEventListener("click", saveForm);
    const lookupButton = document.getElementById("btnTimPhieu");
    if (lookupButton) lookupButton.addEventListener("click", lookupExistingForm);
    const lookupPinInput = document.getElementById("lookupPin");
    if (lookupPinInput) lookupPinInput.addEventListener("keydown", (event) => { if (event.key === "Enter") lookupExistingForm(); });
    resetButton.addEventListener("click", resetForm);
    const printButton = document.getElementById("btnInPhieu");
    if (printButton) printButton.addEventListener("click", printForm);
    memberList.addEventListener("click", (event) => {
        const button = event.target.closest('[data-action="remove-member"]');
        if (!button) return;
        const card = button.closest(".member-card");
        if (card) card.remove();
        renumberMembers();
    });
    memberList.addEventListener("input", (event) => event.target.classList.remove("is-invalid"));
    memberList.addEventListener("change", (event) => event.target.classList.remove("is-invalid"));

    setInitialFormNumber();
    addMember();
})();











