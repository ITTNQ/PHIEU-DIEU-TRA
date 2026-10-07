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
        "soPhieu", "tinhThanh", "phuong", "toDanPho", "toNhom", "soNha", "chuHo",
        "dienCuTru", "dienThoai", "canBoDieuTra", "canBoDieuTra2", "canBoDieuTra3", "truongThon",
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

    function readStudyHistory(card) {
        return [...card.querySelectorAll(".study-history-row")].map((row) => ({
            namHoc: row.querySelector('[data-study-field="namHoc"]').value.trim(),
            lopDangHoc: row.querySelector('[data-study-field="lopDangHoc"]').value.trim(),
            truongDangHoc: row.querySelector('[data-study-field="truongDangHoc"]').value.trim()
        })).filter((record) => record.namHoc || record.lopDangHoc || record.truongDangHoc).slice(0, 5);
    }

    function addStudyHistoryRow(list, data) {
        if (list.querySelectorAll(".study-history-row").length >= 5) return;
        const row = document.createElement("div");
        row.className = "study-history-row";
        const createInput = (field, placeholder, label) => {
            const input = document.createElement("input");
            input.type = "text";
            input.className = "form-control";
            input.dataset.studyField = field;
            input.placeholder = placeholder;
            input.value = data?.[field] || "";
            input.setAttribute("aria-label", label);
            return input;
        };
        row.append(
            createInput("namHoc", "20…–20…", "Năm học"),
            createInput("lopDangHoc", "Lớp", "Lớp theo năm học"),
            createInput("truongDangHoc", "Trường", "Trường theo năm học")
        );
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "btn btn-outline-secondary btn-sm study-history-remove";
        remove.dataset.action = "remove-study-year";
        remove.textContent = "Xóa";
        remove.setAttribute("aria-label", "Xóa dòng năm học");
        row.appendChild(remove);
        list.appendChild(row);
        refreshStudyHistoryEditor(list);
    }

    function refreshStudyHistoryEditor(list) {
        const rows = [...list.querySelectorAll(".study-history-row")];
        rows.forEach((row) => {
            const remove = row.querySelector('[data-action="remove-study-year"]');
            if (remove) remove.disabled = rows.length <= 1;
        });
        const add = list.querySelector('[data-action="add-study-year"]');
        if (add) {
            add.disabled = rows.length >= 5;
            add.textContent = rows.length >= 5 ? "Đã đủ 5 năm học" : "+ Thêm năm học";
        }
    }

    function addStudyHistoryEditor(container, initialData) {
        const editor = document.createElement("div");
        editor.className = "col-12 study-history-editor";
        const labels = document.createElement("div");
        labels.className = "study-history-labels";
        labels.innerHTML = "<span>Năm học</span><span>Lớp</span><span>Trường tương ứng</span><span></span>";
        const list = document.createElement("div");
        list.className = "study-history-list";
        let savedHistory = [];
        if (Array.isArray(initialData?.quaTrinhHoc)) savedHistory = initialData.quaTrinhHoc;
        else if (initialData?.quaTrinhHoc) {
            try { savedHistory = JSON.parse(initialData.quaTrinhHoc); } catch (_) { savedHistory = []; }
        }
        if (!Array.isArray(savedHistory) || !savedHistory.length) {
            savedHistory = [{ lopDangHoc: initialData?.lopDangHoc || "", truongDangHoc: initialData?.truongDangHoc || "" }];
        }
        savedHistory.slice(0, 5).forEach((record) => addStudyHistoryRow(list, record));
        const add = document.createElement("button");
        add.type = "button";
        add.className = "btn btn-outline-primary btn-sm mt-2";
        add.dataset.action = "add-study-year";
        add.addEventListener("click", () => addStudyHistoryRow(list));
        editor.append(labels, list, add);
        container.appendChild(editor);
        refreshStudyHistoryEditor(list);
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
        addField(personalFields, "Dân tộc", "danToc", "text", null, null, "col-md-6");
        addField(personalFields, "Tôn giáo", "tonGiao", "text", null, null, "col-md-6");

        const currentStudyFields = addMemberSection(fields, "2. Học tập hiện tại", "Điền lớp và trường đang học ở thời điểm điều tra.");
        addStudyHistoryEditor(currentStudyFields, initialData);

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
        addField(statusFields, "Lớp / kỳ học khi bỏ học", "lopBoHoc", "text", null, null, "col-md-4");
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
            const history = readStudyHistory(card);
            member.quaTrinhHoc = JSON.stringify(history);
            member.lopDangHoc = history[0]?.lopDangHoc || "";
            member.truongDangHoc = history[0]?.truongDangHoc || "";
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

    function printTableHeader() {
        return `<table class="print-members">
            <colgroup><col class="c-stt"><col class="c-person"><col class="c-year"><col class="c-class"><col class="c-school">
                <col class="c-level"><col class="c-supplement"><col class="c-year-grad"><col class="c-vocational"><col class="c-year-voc">
                <col class="c-xmc"><col class="c-year-xmc"><col class="c-dropout"><col class="c-year-dropout"><col class="c-disability"><col class="c-movement"><col class="c-notes"></colgroup>
            <thead>
                <tr><th rowspan="3">STT</th><th rowspan="3">HỌ VÀ TÊN ĐỐI TƯỢNG<br><small>(Lớn tuổi ghi trước)</small></th>
                    <th colspan="2" rowspan="3">TÊN LỚP ĐANG HỌC<br><small>(Theo năm học)</small></th><th rowspan="3">TÊN TRƯỜNG ĐANG HỌC<br><small>(Tương ứng với từng năm học)</small></th>
                    <th colspan="5">Thông tin Tốt nghiệp<br>(Hoàn thành)</th><th colspan="2" rowspan="2">Học xong</th><th colspan="2" rowspan="2">Bỏ học</th>
                    <th rowspan="3">Khuyết tật</th><th rowspan="3">Chuyển đến,<br>chuyển đi,<br>chết</th><th rowspan="3">Ghi chú</th></tr>
                <tr><th colspan="3">MN -&gt; THPT</th><th colspan="2">TN nghề</th></tr>
                <tr><th>Cấp học</th><th>Bổ túc</th><th>Năm</th><th>Bậc</th><th>Năm</th>
                    <th>Lớp hoặc kỳ học<br>(đối với xóa mù chữ)</th><th>Năm</th>
                    <th>Lớp hoặc kỳ học<br>(đối với xóa mù chữ)</th><th>Năm</th></tr>
            </thead><tbody>`;
    }

    function printMemberRows(member, index, rowStart, rowCount, continuation, suppressMergedData) {
        const history = member?.quaTrinhHoc || [];
        const get = (key) => member ? escapeHtml(member[key] || "") : "";
        const genderText = member
            ? `Nữ: ${member.gioiTinh === "Nữ" ? "☑" : "□"} &nbsp; Nam: ${member.gioiTinh === "Nam" ? "☑" : "□"} &nbsp; DT: ${get("danToc")} &nbsp; TG: ${get("tonGiao")}`
            : "Nữ: □ &nbsp; Nam: □ &nbsp; DT: ______ &nbsp; TG: ______";
        const learningStatus = member?.boHoc === "Có" ? get("lopBoHoc") || "Đã bỏ học" : "";
        const movement = member ? [member.bienDong, displayDate(member.ngayBienDong), member.noiBienDong].filter(Boolean).map(escapeHtml).join("<br>") : "";
        const notes = member ? [member.ghiChuThanhVien, member.bietChu ? `Biết chữ: ${member.bietChu}` : ""].filter(Boolean).map(escapeHtml).join("<br>") : "";
        const rows = [];
        for (let offset = 0; offset < rowCount; offset += 1) {
            const line = rowStart + offset;
            const record = history[line] || {};
            let cells = "";
            if (offset === 0) cells += `<td class="print-stt" rowspan="${rowCount}">${continuation ? "" : index}</td>`;
            if (line === 0) {
                cells += `<td class="print-person print-name">${get("hoTen")}</td>`;
            } else if (line === 1) {
                cells += `<td class="print-person">QH với chủ hộ: ${get("quanHe")}</td>`;
            } else if (line === 2) {
                cells += `<td class="print-person">Ngày sinh: ${escapeHtml(displayDate(member?.ngaySinh || ""))}</td>`;
            } else if (line === 3) {
                cells += `<td class="print-person">${genderText}</td>`;
            } else {
                cells += `<td class="print-person">Cha, mẹ, Người đỡ đầu: ${get("nguoiDoDau")}</td>`;
            }
            cells += `<td class="print-year">${escapeHtml(record.namHoc || "20…–20…")}</td><td>${escapeHtml(record.lopDangHoc || "")}</td><td>${escapeHtml(record.truongDangHoc || "")}</td>`;
            if (offset === 0) {
                const blankOnContinuation = suppressMergedData ? "" : null;
                cells += `<td rowspan="${rowCount}">${blankOnContinuation ?? get("trinhDo")}</td><td rowspan="${rowCount}">${blankOnContinuation ?? get("boTuc")}</td><td rowspan="${rowCount}">${blankOnContinuation ?? get("namTotNghiep")}</td>
                    <td rowspan="${rowCount}">${blankOnContinuation ?? get("ngheBac")}</td><td rowspan="${rowCount}">${blankOnContinuation ?? get("ngheNam")}</td>
                    <td rowspan="${rowCount}">${blankOnContinuation ?? get("lopXoaMuChu")}</td><td rowspan="${rowCount}">${blankOnContinuation ?? get("namXoaMuChu")}</td>
                    <td rowspan="${rowCount}">${blankOnContinuation ?? escapeHtml(learningStatus)}</td><td rowspan="${rowCount}">${blankOnContinuation ?? get("namBoHoc")}</td>
                    <td rowspan="${rowCount}">${blankOnContinuation ?? escapeHtml([member?.khuyetTat, member?.dangKhuyetTat].filter(Boolean).join(" / "))}</td>
                    <td rowspan="${rowCount}">${blankOnContinuation ?? movement}</td><td rowspan="${rowCount}">${blankOnContinuation ?? notes}</td>`;
            }
            rows.push(`<tr class="print-member-line">${cells}</tr>`);
        }
        return rows.join("");
    }

    function printMemberTable(members, slots, withHeader, rowHeightClass) {
        let body = "";
        for (const slot of slots) {
            body += printMemberRows(members[slot.index] || null, slot.index + 1, slot.rowStart || 0, slot.rows, Boolean(slot.continuation), Boolean(slot.suppressMergedData));
        }
        return `${withHeader ? printTableHeader() : `<table class="print-members ${rowHeightClass || ""}"><colgroup><col class="c-stt"><col class="c-person"><col class="c-year"><col class="c-class"><col class="c-school"><col class="c-level"><col class="c-supplement"><col class="c-year-grad"><col class="c-vocational"><col class="c-year-voc"><col class="c-xmc"><col class="c-year-xmc"><col class="c-dropout"><col class="c-year-dropout"><col class="c-disability"><col class="c-movement"><col class="c-notes"></colgroup><tbody>`}${body}</tbody></table>`;
    }

    function printHouseholdHeader() {
        return `<div class="print-page-number">1</div><table class="print-household-table"><colgroup><col><col><col></colgroup>
            <tbody><tr><td>Phường (1): ${escapeHtml(householdDisplay("phuong"))}</td><th>PHIẾU ĐIỀU TRA PHỔ CẬP GIÁO DỤC - XÓA MÙ CHỮ</th><td>Số phiếu (5): <span class="print-form-number-value">${escapeHtml(householdDisplay("soPhieu"))}</span></td></tr>
            <tr><td colspan="2">TDP (2): ${escapeHtml(householdDisplay("toDanPho"))} <span class="print-to">Tổ: ${escapeHtml(householdDisplay("toNhom"))}</span></td><td>Diện cư trú (6): ${escapeHtml(householdDisplay("dienCuTru"))}</td></tr>
            <tr><td>Địa chỉ (3): ${escapeHtml(householdDisplay("soNha"))}</td><td>Họ và tên chủ hộ (4): ${escapeHtml(householdDisplay("chuHo"))}</td><td>Điện thoại (7): ${escapeHtml(householdDisplay("dienThoai"))}</td></tr></tbody></table>`;
    }

    function printSignatures() {
        const dateText = displayDate(householdDisplay("ngayXacNhan")) || ".../.../ Năm 20...";
        const signers = [
            ["Cán bộ, nhân viên điều tra 1", householdDisplay("canBoDieuTra")],
            ["Cán bộ, nhân viên điều tra 2", householdDisplay("canBoDieuTra2")],
            ["Cán bộ, nhân viên điều tra 3", householdDisplay("canBoDieuTra3")],
            ["Trưởng thôn, bản, tổ dân phố", householdDisplay("truongThon")],
            ["Chủ hộ gia đình", householdDisplay("chuHoXacNhan") || householdDisplay("chuHo")]
        ];
        return `<table class="print-signatures"><colgroup><col class="signature-role-col"><col class="signature-date-col"><col class="signature-name-col"><col class="signature-ubnd-col"></colgroup>
            <tbody><tr class="print-signature-head"><th>Họ, tên</th><th colspan="2"></th><td rowspan="${signers.length + 1}"><div class="print-ubnd"><b>XÁC NHẬN<br>CỦA UBND PHƯỜNG</b><span>(Ký tên, đóng dấu)</span><span>Ngày ... tháng ... năm ...</span></div></td></tr>
            ${signers.map(([role, name]) => `<tr><th>${escapeHtml(role)}</th><td class="print-signature-date">${escapeHtml(dateText)}</td><td class="print-signature-name">${escapeHtml(name)}</td></tr>`).join("")}</tbody></table>`;
    }

    function buildPrintPages() {
        const pages = document.getElementById("printPages");
        if (!pages) return;
        const members = [...memberList.querySelectorAll(".member-card")].map((card, index) => {
            const member = { thuTu: index + 1, quaTrinhHoc: readStudyHistory(card) };
            card.querySelectorAll("[data-field]").forEach((field) => { member[field.dataset.field] = field.value.trim(); });
            return member;
        });
        const overflowPages = Math.ceil(Math.max(0, members.length - 7) / 4);
        const pageCount = 2 + overflowPages;
        const firstPageSlots = [{ index: 0, rows: 5 }, { index: 1, rows: 5 }, { index: 2, rows: 3 }];
        const secondPageSlots = [{ index: 2, rowStart: 3, rows: 2, continuation: true, suppressMergedData: true },
            { index: 3, rows: 5 }, { index: 4, rows: 5 }, { index: 5, rows: 5 }, { index: 6, rows: 5 }];
        let html = `<section class="print-sheet print-page-one">${printHouseholdHeader()}${printMemberTable(members, firstPageSlots, true, "")}</section>`;
        html += `<section class="print-sheet print-page-two"><div class="print-page-number">2</div>${printMemberTable(members, secondPageSlots, false, "print-continuation")}${pageCount === 2 ? printSignatures() : ""}</section>`;
        for (let page = 2; page < pageCount; page += 1) {
            const startIndex = 7 + (page - 2) * 4;
            const last = page === pageCount - 1;
            const slots = Array.from({ length: 4 }, (_, offset) => ({ index: startIndex + offset, rows: 5 }));
            html += `<section class="print-sheet print-overflow-page"><div class="print-page-number">${page + 1}</div>${printMemberTable(members, slots, true, "print-continuation")}${last ? printSignatures() : ""}</section>`;
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
        document.querySelectorAll("#soPhieu, #tinhThanh, #phuong, #toDanPho, #toNhom, #soNha, #chuHo, #dienCuTru, #dienThoai, #canBoDieuTra, #canBoDieuTra2, #canBoDieuTra3, #truongThon, #chuHoXacNhan, #ghiChu, #ngayXacNhan")
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
        const removeYear = event.target.closest('[data-action="remove-study-year"]');
        if (removeYear) {
            const list = removeYear.closest(".study-history-list");
            if (list && list.querySelectorAll(".study-history-row").length > 1) {
                removeYear.closest(".study-history-row").remove();
                refreshStudyHistoryEditor(list);
            }
            return;
        }
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











