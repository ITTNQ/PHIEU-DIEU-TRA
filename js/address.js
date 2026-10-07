/* =========================================================
   Nạp và liên kết danh mục Tỉnh/Thành → Phường/Xã.

   Định dạng data/diachi.json:
   {
     "provinces": [
       {
         "code": "...",
         "name": "...",
         "wards": [{ "code": "...", "name": "..." }]
       }
     ]
   }
   ========================================================= */
(function () {
    "use strict";

    const DATA_URL = "data/diachi.json";
    const provinceSelectId = "tinhThanh";
    const wardSelectId = "phuong";

    function makeOption(value, label) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        return option;
    }

    function showStatus(message, isError) {
        const status = document.getElementById("addressStatus");
        if (!status) return;
        status.textContent = message;
        status.classList.toggle("text-danger", Boolean(isError));
        status.classList.toggle("text-muted", !isError);
        status.hidden = !message;
    }

    function normalizeProvinces(data) {
        const source = Array.isArray(data) ? data : data && data.provinces;
        if (!Array.isArray(source)) return [];

        return source.map((province) => {
            const wards = province.wards || province.Wards || province.communes || province.children || [];
            return {
                code: String(province.code ?? province.Code ?? province.id ?? province.name ?? province.FullName ?? ""),
                name: String(province.name ?? province.label ?? province.FullName ?? ""),
                wards: Array.isArray(wards) ? wards.map((ward) => ({
                    code: String(ward.code ?? ward.Code ?? ward.id ?? ward.name ?? ward.FullName ?? ""),
                    name: String(ward.name ?? ward.label ?? ward.FullName ?? "")
                })).filter((ward) => ward.name) : []
            };
        }).filter((province) => province.name);
    }

    function initialize(provinces) {
        const wardSelect = document.getElementById(wardSelectId);
        if (!wardSelect) return;

        const provinceLabel = document.createElement("label");
        provinceLabel.className = "form-label required";
        provinceLabel.htmlFor = provinceSelectId;
        provinceLabel.textContent = "Tỉnh / Thành phố";

        const provinceSelect = document.createElement("select");
        provinceSelect.id = provinceSelectId;
        provinceSelect.name = provinceSelectId;
        provinceSelect.className = "form-select";
        provinceSelect.required = true;
        provinceSelect.appendChild(makeOption("", "-- Chọn tỉnh / thành --"));

        const provinceCol = document.createElement("div");
        provinceCol.className = "col-md-4";
        provinceCol.append(provinceLabel, provinceSelect);

        const wardCol = wardSelect.closest(".col-md-4, .col-md-3, .col-md-2, [class*=\"col-\"]");
        if (wardCol && wardCol.parentElement) {
            wardCol.parentElement.insertBefore(provinceCol, wardCol);
        } else {
            wardSelect.parentElement.insertBefore(provinceCol, wardSelect);
        }

        const placeholder = wardSelect.options[0]?.textContent?.trim() || "-- Chọn phường / xã --";
        wardSelect.replaceChildren(makeOption("", placeholder));
        wardSelect.disabled = true;
        wardSelect.setAttribute("aria-describedby", "addressStatus");
        provinceSelect.setAttribute("aria-describedby", "addressStatus");

        provinces.forEach((province) => {
            const option = makeOption(province.name, province.name);
            option.dataset.code = province.code;
            provinceSelect.appendChild(option);
        });

        provinceSelect.addEventListener("change", () => {
            const selectedProvince = provinces.find((province) => province.name === provinceSelect.value);
            wardSelect.replaceChildren(makeOption("", "-- Chọn phường / xã --"));
            wardSelect.disabled = !selectedProvince;
            if (selectedProvince) {
                selectedProvince.wards.forEach((ward) => {
                    const option = makeOption(ward.name, ward.name);
                    option.dataset.code = ward.code;
                    wardSelect.appendChild(option);
                });
                if (!selectedProvince.wards.length) {
                    showStatus("Tỉnh / Thành phố này chưa có dữ liệu Phường / Xã.", true);
                    return;
                }
                showStatus("", false);
            } else {
                showStatus("", false);
            }
            wardSelect.dispatchEvent(new Event("change", { bubbles: true }));
        });

        if (!provinces.length) {
            showStatus("Danh mục địa chỉ chưa có dữ liệu.", true);
            return;
        }
        showStatus("Chọn Tỉnh / Thành phố trước, sau đó chọn Phường / Xã.", false);
    }

    async function loadAddressData() {
        const wardSelect = document.getElementById(wardSelectId);
        if (!wardSelect) return;
        showStatus("Đang tải danh mục địa chỉ…", false);

        try {
            const response = await fetch(DATA_URL, { cache: "no-cache" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const rawData = await response.json();
            const provinces = normalizeProvinces(rawData);
            initialize(provinces);
        } catch (error) {
            console.error("Không tải được danh mục địa chỉ:", error);
            showStatus("Chưa tải được danh mục địa chỉ. Hãy kiểm tra file data/diachi.json và mở project qua máy chủ web.", true);
            wardSelect.disabled = true;
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", loadAddressData, { once: true });
    } else {
        loadAddressData();
    }
})();



