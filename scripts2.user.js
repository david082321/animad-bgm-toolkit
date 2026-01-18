// ==UserScript==
// @name         Bangumi 自動更新觀看進度
// @namespace    https://example.com/
// @version      1.5
// @description  自動於 ?watch= 頁面標記已看。若未追番則自動設為「在看」。
// @author       david082321
// @match        https://bgm.tv/subject/*
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

    // === Overlay Helpers ===
    function overlay(text) {
        removeOverlay();
        const overlay = document.createElement('div');
        overlay.id = 'bgm-watch-overlay';
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: '2147483647',
            pointerEvents: 'auto', userSelect: 'none', cursor: 'wait', padding: '20px', boxSizing: 'border-box'
        });
        const box = document.createElement('div');
        box.style.textAlign = 'center';
        box.innerHTML = `<div style="font-size:20px;font-weight:600;margin-bottom:8px;">${text}</div>
                         <div style="opacity:0.9;font-size:14px;">Subject ${subjectId} • episode ${watchParam}</div>`;
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

    // === 主邏輯開始 ===

    const state = GM_getValue(key);
    // 檢查是否剛從「自動追番」跳轉回來
    if (state && state.status === 'working') {
        if (Date.now() - state.time > 20000) { // 追番+標記可能較久，放寬到20秒
            cleanupAndClose('⚠️ 超時未完成，自動關閉');
            return;
        }
    } else {
        // 第一次進入頁面，初始化狀態
        GM_setValue(key, { status: 'working', time: Date.now(), session: sessionId });
    }

    overlay('正在檢查觀看狀態……');

    // 監控集數列表載入
    let checks = 0;
    const checkInterval = setInterval(() => {
        const list = document.querySelector('.prg_list');
        if (list) {
            clearInterval(checkInterval);
            process(list);
            return;
        }
        if (++checks >= 10) {
            clearInterval(checkInterval);
            cleanupAndClose('超時未載入集數列表');
        }
    }, 1000);

    function process(list) {
        let epLabel = watchParam;
        if (/^\d+(\.\d+)?$/.test(watchParam)) {
            const [i, d] = watchParam.split('.');
            epLabel = i.padStart(2, '0') + (d ? '.' + d : '');
        }

        const target = Array.from(list.querySelectorAll('a'))
            .find(a => a.textContent.trim() === epLabel);
        
        if (!target) return cleanupAndClose('❌ 找不到對應集數');
        if (target.classList.contains('epBtnWatched')) return cleanupAndClose('✅ 此集已標記為已看');

        const epId = target.id.replace('prg_', '');
        const watchedBtn = document.getElementById(`WatchedTill_${epId}`);

        // 處理找不到「看到」按鈕的情況
        if (!watchedBtn) {
            const isWatching = !!document.querySelector('.interest_now'); // 檢查是否有「我在看這部動畫」字樣
            
            if (!isWatching) {
                overlay('📝 檢測到未收藏，正在自動設為「在看」...');
                
                // 尋找隱藏的收藏表單中的「在看」選項
                const doRadio = document.getElementById('do'); 
                const saveBtn = document.querySelector('#collectBoxForm input[name="update"]');
                
                if (doRadio && saveBtn) {
                    doRadio.checked = true; // 勾選「在看」
                    saveBtn.click();        // 提交表單（頁面會更新，腳本會重新執行並進入下一步）
                    return; 
                } else {
                    return cleanupAndClose('❌ 無法自動切換追番狀態');
                }
            }
            return cleanupAndClose('❌ 找不到「看到」按鈕且無法修復');
        }
        // ------------------------------------------

        const href = watchedBtn.getAttribute('href');
        if (!href) return cleanupAndClose('❌ 無法取得標記連結');

        overlay(`➡️ 正在標記第 ${epLabel} 集…`);
        window.location.href = href;
    }

    window.addEventListener('beforeunload', () => {
        const s = GM_getValue(key);
        if (s && s.session === sessionId) GM_deleteValue(key);
    });
})();
