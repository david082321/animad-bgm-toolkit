// ==UserScript==
// @name         動畫瘋-BGM.TV 點格子
// @namespace    AnimadWithBgmtv
// @version      0.5.0
// @description  點格子
// @author       david082321
// @match        https://ani.gamer.com.tw/animeVideo.php?*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ani.gamer.com.tw
// @grant        none
// @license      none
// ==/UserScript==

let videoTitle = document.title.split(" [")[0];
let videoEpisode = document.title.split(" [")[1].split("]")[0];
let bgmUrl = "";
let bgmUrlAuto = "";
const STORAGE_KEY = "bgmtv_animeData";
const STORAGE_TIME = "bgmtv_lastUpdate";
const REMOTE_URL = `https://raw.githubusercontent.com/david082321/animad-bgm-toolkit/refs/heads/main/animeData.json?t=${Date.now()}`;

// 解析動畫映射表（自動更新）
async function getAnimeData() {
    const now = Date.now();
    const lastUpdate = localStorage.getItem(STORAGE_TIME);
    let data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (!lastUpdate || now - lastUpdate > 86400000 || Object.keys(data).length === 0) {
        try {
            const res = await fetch(REMOTE_URL, { cache: "no-store" });
            if (res.ok) {
                data = await res.json();
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                localStorage.setItem(STORAGE_TIME, now);
            }
        } catch (err) {
            console.error("更新失敗，使用本機快取", err);
        }
    }
    return data;
}

(async () => {
    const animeData = await getAnimeData();
    const bgmLink = document.createElement("a");
    bgmLink.target = "_blank";
    bgmLink.id = "bgmtv";

    function init_bgmlink() {
        const info = animeData[videoTitle];
        let bgmUrl = "";
        if (info) {
            // 如果有多部（parts）
            if (info.parts) {
                for (const part of info.parts) {
                    const start = part.startEp ?? 1;
                    const end = part.endEp ?? Infinity;
                    if (videoEpisode >= start && videoEpisode <= end) {
                        bgmUrl = `https://bgm.tv/subject/${part.bgmId}`;
                    }
                }
            }
            // 否則單一部
            else if (info.bgmId) {
                bgmUrl = `https://bgm.tv/subject/${info.bgmId}`;
            }
        }
        if (bgmUrl !== "") {
            bgmUrlAuto = bgmUrl + "?watch=" + videoEpisode;
            bgmLink.innerText = "點格子  ";
        } else {
            bgmUrl = "https://bgm.tv/subject_search/" + videoTitle + "?cat=all";
            bgmUrlAuto = bgmUrl;
            bgmLink.innerText = "點格子?  ";
        }
        bgmLink.href = bgmUrl;
        const targetBtn = document.querySelector(".anime_name > button");
        if (targetBtn) targetBtn.insertAdjacentElement("afterend", bgmLink);
    }

    const css = document.createElement("style");
    css.innerHTML = `
#bgmtv {
    position: relative;
    left: 10px;
    top: 3px;
    font-size: 1.5em;
    cursor: pointer;
    color: var(--videoplayer-anime-title);
}
#bgmtv:hover {color: var(--anime-primary-hover);}
`;
    document.body.append(css);

    // 延遲等待影片載入
    function init() {
        const videos = document.querySelectorAll("video");
        if (!videos.length) {
            setTimeout(init, 3000);
            return;
        }

        videos.forEach((video) => {
            if (video.dataset.hasWatcher) return;
            video.dataset.hasWatcher = "true";

            video.addEventListener("pause", () => handlePause(video));
            video.addEventListener("ended", () => handleEnded(video));
        });
    }

    // 手動暫停時觸發（若進度 > 90%）
    function handlePause(video) {
        const percent = (video.currentTime / video.duration) * 100;
        const leftTime = video.duration - video.currentTime;
        if ((percent >= 90 || leftTime <= 90) && !video.dataset.prompted) {
            showPrompt(video);
        }
    }

    // 自動播完觸發
    function handleEnded(video) {
        if (!video.dataset.prompted) {
            showPrompt(video);
        }
    }

    let saveBtn = null;
    let keepVisible = null;
    let btnObserver = null;
    let currentVideo = null;

    // 移除按鈕並「徹底清理」所有監聽
    function removeBtn() {
        if (saveBtn && saveBtn.parentElement) {
            saveBtn.remove();
        }
        if (currentVideo) {
            currentVideo.dataset.prompted = "";
        }
        if (keepVisible) {
            clearInterval(keepVisible);
            keepVisible = null;
        }
        if (btnObserver) {
            btnObserver.disconnect();
            btnObserver = null;
        }
    }

    // 顯示提示按鈕
    function showPrompt(video) {
        // 設置標記和當前影片
        video.dataset.prompted = "true";
        currentVideo = video;

        // 1. 建立按鈕容器 (如果不存在)
        if (!saveBtn) {
            saveBtn = document.createElement("div");
            saveBtn.id = "saveWatchBtnContainer";

            // 容器樣式
            Object.assign(saveBtn.style, {
                position: "fixed",
                bottom: "66px",
                right: "30px",
                zIndex: "2147483647",
                padding: "10px 10px 10px 15px",
                fontSize: "16px",
                backgroundColor: "rgba(33,150,243,0.9)",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                // cursor: 'pointer', // 移除：改由內部元素控制
                backdropFilter: "blur(4px)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                transition: "opacity 0.3s ease",
                display: "flex",
                alignItems: "center",
            });

            // --- 建立內部元素 ---

            // 1. 主要操作 (儲存)
            const mainAction = document.createElement("span");
            mainAction.textContent = "✅ 儲存觀看記錄";
            mainAction.style.cursor = "pointer";
            mainAction.style.paddingRight = "12px"; // 和關閉按鈕的間距

            mainAction.onclick = () => {
                removeBtn(); // 點擊時徹底清除
                window.open(bgmUrlAuto, "_blank");
            };

            // 2. 關閉按鈕 [X]
            const closeAction = document.createElement("span");
            closeAction.textContent = "[X]";
            Object.assign(closeAction.style, {
                cursor: "pointer",
                fontWeight: "bold",
                padding: "6px 8px", // 增加點擊範圍
                marginLeft: "6px",
                borderRadius: "4px",
                borderLeft: "1px solid rgba(255,255,255,0.4)",
                paddingLeft: "12px",
            });

            // 關閉按鈕的 hover 效果
            closeAction.onmouseenter = () => {
                closeAction.style.backgroundColor = "rgba(0,0,0,0.2)";
            };
            closeAction.onmouseleave = () => {
                closeAction.style.backgroundColor = "transparent";
            };

            closeAction.onclick = () => {
                removeBtn(); // 點擊時徹底清除
            };

            // 3. 將元素加入容器
            saveBtn.appendChild(mainAction);
            saveBtn.appendChild(closeAction);
        }

        // 2. 顯示按鈕 (附加到正確的 DOM)
        const targetElement = document.fullscreenElement || document.body;
        targetElement.appendChild(saveBtn);

        // 3. 綁定「播放時自動移除」
        // 使用 { once: true } 確保它只觸發一次
        const handlePlay = () => removeBtn();
        video.addEventListener("play", handlePlay, { once: true });

        // 4. 啟動「守衛」(如果它們還沒啟動)
        // 🔹 修復 F11 模式
        if (!keepVisible) {
            keepVisible = setInterval(() => {
                // 確保按鈕在 DOM 中
                if (saveBtn && !document.contains(saveBtn)) {
                    const target = document.fullscreenElement || document.body;
                    target.appendChild(saveBtn);
                }
                // 確保按鈕可見 (防止被 CSS 隱藏)
                if (saveBtn) saveBtn.style.display = "flex"; // <- 注意: 這裡要改成 'flex'
            }, 1000);
        }

        // 🔹 清理 (當按鈕被意外移除時)
        if (!btnObserver) {
            btnObserver = new MutationObserver(() => {
                if (saveBtn && !document.contains(saveBtn)) {
                    // 按鈕被 JS 移除了 (例如切換影片)
                    // 我們就順勢清理掉所有東西
                    removeBtn();
                }
            });
            btnObserver.observe(document, { childList: true, subtree: true });
        }
    }

    // 🔹 全螢幕變化監聽 (移到全域，只綁定一次)
    document.addEventListener("fullscreenchange", () => {
        // 如果按鈕存在，就移動它
        if (saveBtn && saveBtn.parentElement) {
            const fs = document.fullscreenElement;
            if (fs) fs.appendChild(saveBtn);
            else document.body.appendChild(saveBtn);
        }
    });

    // 啟動
    init_bgmlink();
    window.addEventListener("load", init);

    function watchAnimeTitleChange(callback) {
        const target = document.querySelector(".anime_name h1");
        if (!target) {
            // console.warn('[BGM腳本] 找不到 anime_name h1，稍後再試...');
            setTimeout(() => watchAnimeTitleChange(callback), 1000);
            return;
        }

        let lastTitle = target.textContent.trim();

        const observer = new MutationObserver(() => {
            const newTitle = target.textContent.trim();
            if (newTitle !== lastTitle) {
                // console.log(`[BGM腳本] 標題變化: ${lastTitle} → ${newTitle}`);
                lastTitle = newTitle;
                callback(newTitle);
            }
        });
        observer.observe(target, { childList: true, characterData: true, subtree: true });
    }

    watchAnimeTitleChange((newTitle) => {
        // console.log('目前標題：', newTitle);
        videoTitle = newTitle.split(" [")[0];
        videoEpisode = newTitle.split(" [")[1].split("]")[0];
        init_bgmlink();
    });
})();
