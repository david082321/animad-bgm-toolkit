// ==UserScript==
// @name         動畫瘋頁面標記 BGM.TV 觀看進度
// @namespace    https://github.com/david082321/animad-bgm-toolkit
// @version      1.0.0
// @description  在動畫瘋集數列表標記 BGM.TV 已看過記錄
// @author       david082321 & Gemini
// @match        https://ani.gamer.com.tw/animeVideo.php?*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=bgm.tv
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      acg.gamer.com.tw
// @connect      raw.githubusercontent.com
// @connect      api.bgm.tv
// @run-at       document-end
// ==/UserScript==

(async () => {
    'use strict';

    let videoTitle = document.title.split(" [")[0];
    const STORAGE_KEY = "animad_animeData";
    const STORAGE_TIME = "animad_lastUpdate";
    const REMOTE_URL = "https://raw.githubusercontent.com/david082321/animad-bgm-toolkit/refs/heads/main/animeData.json";

    // --- 選項設定 ---
    let username = GM_getValue("bgm_username", "");

    GM_registerMenuCommand(`設定 BGM 用戶名 (目前: ${username || '未設定'})`, () => {
        const val = prompt("請輸入 BGM.TV 用戶名 (設置了用戶名之後無法使用 UID)：", username);
        if (val !== null) {
            GM_setValue("bgm_username", val.trim());
            location.reload();
        }
    });

    // --- CSS 注入 ---
    const style = document.createElement('style');
    style.innerHTML = `
        /* 讓按鈕內部可以進行絕對定位，並切掉超出圓角的範圍 */
/*
        .season ul li {
            position: relative !important;
        }
*/
        .season ul li.bgm-saw {
            border: 1px solid #ff8a00 !important;
            overflow: hidden !important;
        }
        /* 完美塞在按鈕內部最上方 */
        .season ul li.bgm-saw:before {
            content: "已看過";
            width: 53px;
            font-size: 12px;
            position: absolute;
            background: #ff8a00;
            color: #fff;
            padding: 2px;
            left: -2px;
            border-radius: 3px;
            overflow: hidden;
            pointer-events: none;
            z-index: 5;
        }

        /* 動畫瘋原本文字置中，稍微往下挪一點點避免被「已看記錄」擋到 */
        .season ul li.bgm-saw a {
            padding-top: 12px !important;
            //color: #ff8a00 !important;
        }
    `;
    document.head.appendChild(style);

    // --- 快取機制 ---
    const bgmApiCache = {};

    async function getAnimeData() {
        const now = Date.now();
        const lastUpdate = GM_getValue(STORAGE_TIME, 0);
        let data = GM_getValue(STORAGE_KEY, {});
        if (!lastUpdate || now - lastUpdate > 86400000 || Object.keys(data).length === 0) {
            try {
                const res = await fetch(REMOTE_URL, { cache: "no-store" });
                if (res.ok) {
                    data = await res.json();
                    GM_setValue(STORAGE_KEY, data);
                    GM_setValue(STORAGE_TIME, now);
                }
            } catch (err) { console.error("Data update failed", err); }
        }
        return data;
    }

    function getBgmCollection(subjectId) {
        return new Promise((resolve) => {
            if (!username) return resolve(null);
            GM_xmlhttpRequest({
                method: "GET",
                url: `https://api.bgm.tv/v0/users/${username}/collections/${subjectId}`,
                headers: { "User-Agent": "Mozilla/5.0 (Script)" },
                onload: (res) => {
                    if (res.status === 200) resolve(JSON.parse(res.responseText));
                    else resolve(null);
                },
                onerror: () => resolve(null)
            });
        });
    }

    async function getWatchedCount(bgmId) {
        if (bgmApiCache[bgmId] !== undefined) return bgmApiCache[bgmId];
        const collection = await getBgmCollection(bgmId);
        const count = (collection && collection.ep_status) ? collection.ep_status : 0;
        bgmApiCache[bgmId] = count;
        return count;
    }

    async function markEpisodes() {
        const animeData = await getAnimeData();
        const info = animeData[videoTitle];
        if (!info || !username) return;

        const epItems = document.querySelectorAll(".season ul li");

        const processPart = async (bgmId, offset, startEp, endEp) => {
            const watchedCount = await getWatchedCount(bgmId);
            if (watchedCount === 0) return;

            epItems.forEach(li => {
                const link = li.querySelector("a");
                if (!link) return;
                const epNum = parseFloat(link.innerText);

                if (epNum >= startEp && epNum <= endEp) {
                    const relativeOrder = epNum + (offset || 0);

                    if (relativeOrder === watchedCount) {
                        if (!li.classList.contains("bgm-saw")) {
                            li.classList.add("bgm-saw");
                        }
                    }
                }
            });
        };

        if (info.parts) {
            for (const part of info.parts) {
                await processPart(part.bgmId, part.offset, part.startEp || 1, part.endEp || 999);
            }
        } else if (info.bgmId) {
            await processPart(info.bgmId, info.offset, 1, 999);
        }
    }

    // --- 核心動態維護邏輯 ---
    let seasonObserver = null;

    function safeMarkEpisodes() {
        // 1. 如果觀察者正在執行，先斷開，避免我們自己改 class 導致無窮重繪
        if (seasonObserver) {
            seasonObserver.disconnect();
        }

        // 2. 執行標記邏輯
        markEpisodes().then(() => {
            // 3. 標記完成後，重新接上觀察者
            const seasonSection = document.querySelector(".season");
            if (seasonSection && seasonObserver) {
                seasonObserver.observe(seasonSection, {
                    childList: true,
                    subtree: true,
                    attributes: true,          // 監聽屬性改變 (例如 class 被巴哈改掉)
                    attributeFilter: ["class"] // 只鎖定 class 改變
                });
            }
        });
    }

    // 初始化觀察者
    const seasonSection = document.querySelector(".season");
    if (seasonSection) {
        seasonObserver = new MutationObserver(() => {
            safeMarkEpisodes();
        });
        // 首次啟動觀察
        seasonObserver.observe(seasonSection, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class"]
        });
    }

    // 監聽大標題切換
    const titleObserver = new MutationObserver(() => {
        const newTitle = document.querySelector(".anime_name h1")?.textContent.split(" [")[0];
        if (newTitle && newTitle !== videoTitle) {
            videoTitle = newTitle;
            safeMarkEpisodes();
        }
    });
    const targetTitle = document.querySelector(".anime_name h1");
    if (targetTitle) titleObserver.observe(targetTitle, { childList: true, characterData: true, subtree: true });

    // 【安全防線】每 1 秒強制檢查一次（應付任何觀察者漏掉的框架黑魔法）
    setInterval(safeMarkEpisodes, 1000);

    // 首次執行
    safeMarkEpisodes();

})();