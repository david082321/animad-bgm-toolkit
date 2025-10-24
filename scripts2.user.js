// ==UserScript==
// @name         Bangumi 自動更新觀看進度
// @namespace    https://example.com/
// @version      1.4
// @description  自動於 ?watch= 頁面標記已看並關閉分頁，防止卡住顯示半透明覆蓋層
// @author       david082321
// @match        https://bgm.tv/subject/*?watch=*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @license      none
// ==/UserScript==

(function () {
    'use strict';

    const url = new URL(window.location.href);
    const subjectId = url.pathname.split('/').pop();
    const watchParam = url.searchParams.get('watch');
    if (!watchParam) return;

    const sessionId = Math.random().toString(36).slice(2, 10);
    const key = `bgm_watch_${subjectId}_${watchParam}`;

    // === Overlay ===

    // Overlay helpers -------------------------------------------------------
    function overlay(text) {
        removeOverlay(); // 先移除舊的（若有）
        const overlay = document.createElement('div');
        overlay.id = 'bgm-watch-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.6)', // 半透明黑
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '2147483647', // 極大，確保蓋過所有元素
            pointerEvents: 'auto', // 攔截所有互動
            userSelect: 'none',
            cursor: 'wait',
            padding: '20px',
            boxSizing: 'border-box'
        });

        const box = document.createElement('div');
        box.style.maxWidth = '80%';
        box.style.textAlign = 'center';
        box.style.fontSize = '18px';
        box.style.lineHeight = '1.6';

        const title = document.createElement('div');
        title.textContent = text || '處理中...';
        title.style.fontSize = '20px';
        title.style.fontWeight = '600';
        title.style.marginBottom = '8px';

        const sub = document.createElement('div');
        sub.textContent = `Subject ${subjectId} • episode ${watchParam}`;
        sub.style.opacity = '0.9';
        sub.style.fontSize = '14px';

        box.appendChild(title);
        box.appendChild(sub);
        overlay.appendChild(box);

        document.documentElement.appendChild(overlay);
    }

    function removeOverlay() {
        const old = document.getElementById('bgm-watch-overlay');
        if (old) old.remove();
    }

    function cleanupAndClose(msg) {
        overlay(msg || '完成，將關閉分頁...');
        GM_deleteValue(key);
        setTimeout(() => {
            removeOverlay();
            window.close();
        }, 1500);
    }
    // ----------------------------------------------------------------------

    // === 防呆：若頁面被 302 回來 ===
    const state = GM_getValue(key);
    if (state && state.status === 'working') {
        if (Date.now() - state.time > 10000) {
            cleanupAndClose('⚠️ 超時未完成，自動關閉');
        } else {
            cleanupAndClose('✅ 標記完成，關閉中...');
        }
        return;
    }

    GM_setValue(key, { status: 'working', time: Date.now(), session: sessionId });
    overlay('標記觀看進度中……請稍候，完成後此頁面將關閉');

    // === 監控 .prg_list ===
    let checks = 0;
    const checkInterval = setInterval(() => {
        const list = document.querySelector('.prg_list');
        if (list) {
            clearInterval(checkInterval);
            process(list); // 找到後進入處理流程
            return;
        }

        checks++;
        if (checks >= 10) { // 10 秒超時
            clearInterval(checkInterval);
            cleanupAndClose('超時未載入集數列表，關閉中...');
        }
    }, 1000);

    // === 超時防卡 ===
    const timeout = setTimeout(() => {
        cleanupAndClose('⚠️ 未偵測到集數列表，自動關閉');
    }, 10000);

    function process(list) {
        clearTimeout(timeout);

        // 處理 watch 參數格式
        let epLabel = watchParam;
        if (/^\d+(\.\d+)?$/.test(watchParam)) {
            const [i, d] = watchParam.split('.');
            epLabel = i.padStart(2, '0') + (d ? '.' + d : '');
        }

        const target = Array.from(list.querySelectorAll('a'))
            .find(a => a.textContent.trim() === epLabel);
        if (!target) return cleanupAndClose('❌ 找不到對應集數，關閉中');

        if (target.classList.contains('epBtnWatched')) {
            return cleanupAndClose('✅ 此集已標記為已看');
        }

        const prgId = target.id || '';
        if (!prgId.startsWith('prg_')) {
            return cleanupAndClose('⚠️ 無效的 prg ID，關閉中');
        }

        const epId = prgId.replace('prg_', '');
        const watchedBtn = document.getElementById(`WatchedTill_${epId}`);
        if (!watchedBtn) return cleanupAndClose('❌ 找不到「看到」按鈕');

        const href = watchedBtn.getAttribute('href');
        if (!href) return cleanupAndClose('❌ 無法取得標記連結');

        overlay(`➡️ 正在標記第 ${epLabel} 集…`);
        window.location.href = href; // Bangumi 會 302 回來
    }

    // === 防止永遠卡在 working ===
    window.addEventListener('beforeunload', () => {
        const s = GM_getValue(key);
        if (s && s.session === sessionId) GM_deleteValue(key);
    });

})();
