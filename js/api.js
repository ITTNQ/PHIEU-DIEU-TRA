/* API client cho phiếu điều tra. */
(function () {
    "use strict";

    const API_URL = "https://script.google.com/macros/s/AKfycby-4XW2VNyW4H_rxPQdBkmlqQnZPYh9d3CunXAjVI-_Q-mrMsDdeXa3MoDJgzZhmxM6Ag/exec";

    async function submit(payload) {
        if (!API_URL.trim()) return { sent: false, reason: "not-configured" };
        try {
            await fetch(API_URL, {
                method: "POST",
                mode: "no-cors",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(payload)
            });
            return { sent: true, confirmed: false };
        } catch (error) {
            console.error("Không gửi được phiếu đến Apps Script:", error);
            return { sent: false, reason: "network-error", error };
        }
    }

    function lookup(maPhieu, pin) {
        return new Promise((resolve, reject) => {
            const callbackName = "__formLookup_" + Date.now() + "_" + Math.random().toString(36).slice(2);
            const script = document.createElement("script");
            let settled = false;
            const timer = window.setTimeout(() => finish(new Error("Hết thời gian chờ khi tra cứu phiếu.")), 20000);

            function finish(error, result) {
                if (settled) return;
                settled = true;
                window.clearTimeout(timer);
                delete window[callbackName];
                script.remove();
                if (error) reject(error);
                else resolve(result);
            }

            window[callbackName] = (result) => finish(null, result);
            script.onerror = () => finish(new Error("Không kết nối được Apps Script."));
            const params = new URLSearchParams({
                action: "lookup",
                maPhieu: maPhieu,
                pin: pin,
                callback: callbackName,
                _: String(Date.now())
            });
            script.src = API_URL + "?" + params.toString();
            document.head.appendChild(script);
        });
    }

    window.FormApi = Object.freeze({
        isConfigured: () => Boolean(API_URL.trim()),
        submit,
        lookup
    });
})();
