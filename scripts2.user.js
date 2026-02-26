// ==UserScript==
// @name         Bangumi 自動更新觀看進度
// @namespace    https://github.com/david082321/animad-bgm-toolkit
// @version      1.7.0
// @description  在帶有 ?watch= 參數時，自動標記 Bangumi 集數為已看；若未收藏則自動設為「在看」。
// @author       david082321
// @match        https://bgm.tv/subject/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @license      MIT
// @run-at       document-end
// ==/UserScript==

/*
 * This script is designed to work together with a companion script
 * that opens Bangumi subject pages with a ?watch=episode parameter.
 *
 * Behavior summary:
 *
 * - The script activates only when a "watch" URL parameter is present
 *   (or a short-lived cached task exists).
 *
 * - It automatically marks the specified episode as "watched".
 *
 * - If the subject is not yet in the user's collection,
 *   it will automatically set the status to "Watching"
 *   before marking the episode.
 *
 * - This script performs DOM interactions equivalent to
 *   manual button clicks (form submission and navigation).
 *
 * - No background API requests, tracking, analytics,
 *   or external data transmission are performed.
 *
 * - No external JavaScript is loaded.
 *
 * - The script does not run on unrelated pages and
 *   does nothing during normal browsing without ?watch.
 */

(function () {
    'use strict';

    const url = new URL(window.location.href);
    const subjectId = url.pathname.split('/').pop();
    if (!/^\d+$/.test(subjectId)) return; // 確保在條目頁面

    // 儲存鍵名
    const taskKey = `bgm_pending_watch_${subjectId}`;

    // 優先從網址取值，若網址沒有則從快取拿（處理跳轉後的情況）
    let watchParam = url.searchParams.get('watch');

    if (watchParam) {
        // 如果網址有參數，更新快取任務
        GM_setValue(taskKey, { ep: watchParam, time: Date.now() });
    } else {
        // 如果網址沒參數，檢查快取是否有 1 分鐘內的未完成任務
        const savedTask = GM_getValue(taskKey);
        if (savedTask && (Date.now() - savedTask.time < 60 * 1000)) {
            watchParam = savedTask.ep;
        } else {
            return; // 真的沒有任務，停止執行
        }
    }

    const sessionId = Math.random().toString(36).slice(2, 10);

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
                         <div style="opacity:0.9;font-size:14px;">條目 ${subjectId} • 第 ${watchParam} 集</div>`;
        overlay.appendChild(box);
        document.documentElement.appendChild(overlay);
    }

    function removeOverlay() {
        const old = document.getElementById('bgm-watch-overlay');
        if (old) old.remove();
    }

    function cleanupAndClose(msg) {
        overlay(msg || '完成，將關閉分頁...');
        GM_deleteValue(taskKey); // 徹底清除任務
        setTimeout(() => {
            removeOverlay();
            window.close();
        }, 1500);
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
            // 只有在網址有參數時才報錯，避免在普通頁面彈窗
            if (url.searchParams.get('watch')) cleanupAndClose('超時未載入集數列表');
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

        // 處理未追番/找不到按鈕
        if (!watchedBtn) {
            const isWatching = !!document.querySelector('.interest_now');

            if (!isWatching) {
                overlay('📝 檢測到未收藏，正在設定為「在看」並重新標記...');
                const doRadio = document.getElementById('do');
                const saveBtn = document.querySelector('#collectBoxForm input[name="update"]');

                if (doRadio && saveBtn) {
                    doRadio.checked = true;
                    saveBtn.click(); // 此處會導致頁面跳轉至沒有 ?watch 的 URL
                    return;
                } else {
                    return cleanupAndClose('❌ 無法自動切換追番狀態，請確認登入狀態');
                }
            }
            return cleanupAndClose('❌ 找不到「看到」按鈕，請確認登入狀態');
        }

        const href = watchedBtn.getAttribute('href');
        overlay(`➡️ 正在標記第 ${epLabel} 集…`);
        window.location.href = href;
    }
})();
