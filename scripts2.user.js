// ==UserScript==
// @name         Bangumi 自動更新觀看進度
// @namespace    https://github.com/david082321/animad-bgm-toolkit
// @version      1.8.5
// @description  在帶有 ?watch= 參數時，自動標記 Bangumi 集數為已看；若收藏狀態不是「在看」則自動改為「在看」。
// @author       david082321
// @match        https://bgm.tv/subject/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=bgm.tv
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
 * - If the subject is not currently marked as "Watching",
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
    let fillMode = url.searchParams.get('fill') === '1';
    let task = null;

    if (watchParam) {
        // 如果網址有參數，更新快取任務
        const previousTask = GM_getValue(taskKey) || {};
        task = {
            ...previousTask,
            ep: watchParam,
            fill: fillMode,
            time: Date.now(),
            statusSwitchTried: false
        };
        GM_setValue(taskKey, task);
    } else {
        // 如果網址沒參數，檢查快取是否有 1 分鐘內的未完成任務
        const savedTask = GM_getValue(taskKey);
        if (savedTask && (Date.now() - savedTask.time < 60 * 1000)) {
            task = savedTask;
            watchParam = savedTask.ep;
            fillMode = !!savedTask.fill;
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

    function saveTask(patch) {
        task = {
            ...(task || {}),
            ep: watchParam,
            fill: fillMode,
            time: Date.now(),
            ...patch
        };
        GM_setValue(taskKey, task);
    }

    function getCurrentInterestValue() {
        const checked = document.querySelector('#collectBoxForm input[name="interest"]:checked');
        if (checked) return checked.value;

        const scripts = Array.from(document.scripts)
            .map(script => script.textContent || '')
            .join('\n');
        const match = scripts.match(/\bINTEREST_TYPE\s*=\s*(\d+)/);
        return match ? match[1] : '';
    }

    function isWatchingStatus() {
        if (getCurrentInterestValue() === '3') return true;

        const interestText = document.querySelector('.interest_now');
        return !!interestText && /在看|Watching/i.test(interestText.textContent);
    }

    function switchToWatching() {
        if (task && task.statusSwitchTried) {
            return cleanupAndClose('❌ 已嘗試切換為「在看」，但狀態仍未更新');
        }

        const doRadio = document.getElementById('do');
        const saveBtn = document.querySelector('#collectBoxForm input[name="update"]');

        if (!doRadio || !saveBtn) {
            return cleanupAndClose('❌ 無法自動切換追番狀態，請確認登入狀態');
        }

        overlay('📝 正在將收藏狀態設定為「在看」並重新標記...');
        saveTask({ statusSwitchTried: true });
        doRadio.checked = true;
        saveBtn.click();
    }

    function closeThickboxIfOpen() {
        const thickbox = document.getElementById('TB_window');
        if (!thickbox || thickbox.style.display === 'none') return false;

        const closeBtn = document.getElementById('TB_closeWindowButton');
        if (closeBtn) {
            closeBtn.click();
            return true;
        }

        if (typeof window.TB_remove === 'function') {
            window.TB_remove();
            return true;
        }

        return false;
    }

    function finishAfterEpisodeClick() {
        const startedAt = Date.now();
        const timer = setInterval(() => {
            const closedPopup = closeThickboxIfOpen();
            if (closedPopup || Date.now() - startedAt > 2000) {
                clearInterval(timer);
                cleanupAndClose(closedPopup
                    ? '✅ 已標記並關閉修改收藏彈窗，將關閉分頁...'
                    : '✅ 已送出標記，將關閉分頁...');
            }
        }, 250);
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

        if (!isWatchingStatus()) {
            return switchToWatching();
        }

        if (target.classList.contains('epBtnWatched')) return cleanupAndClose('✅ 此集已標記為已看');

        const epId = target.id.replace('prg_', '');
        const watchedBtn = fillMode
            ? document.getElementById(`WatchedTill_${epId}`)
            : document.getElementById(`Watched_${epId}`);

        // 處理找不到按鈕
        if (!watchedBtn) {
            return cleanupAndClose(fillMode
                ? '❌ 找不到指定集數的「看到」按鈕，請確認登入狀態'
                : '❌ 找不到指定集數的「看過」按鈕，請確認登入狀態');
        }

        overlay(`➡️ 正在標記第 ${epLabel} 集…`);
        watchedBtn.click();
        finishAfterEpisodeClick();
    }
})();
