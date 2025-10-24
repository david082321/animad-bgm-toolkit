// ==UserScript==
// @name         動畫瘋-BGM.TV 點格子
// @namespace    AnimadWithBgmtv
// @version      0.3.0
// @description  點格子
// @author       david082321
// @match        https://ani.gamer.com.tw/animeVideo.php?*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ani.gamer.com.tw
// @grant        none
// @license      none
// ==/UserScript==

let videoTitle = document.title.split(" [")[0]
let videoEpisode = document.title.split(" [")[1].split("]")[0]
let bgmUrl = ""
let bgmUrlAuto = ""
const STORAGE_KEY = "bgmtv_animeData"
const STORAGE_TIME = "bgmtv_lastUpdate"
const REMOTE_URL = `https://raw.githubusercontent.com/david082321/animad-bgm-toolkit/refs/heads/main/animeData.json?t=${Date.now()}`

// 取 keyValue（自動更新）
async function getKeyValue() {
    const now = Date.now()
    const lastUpdate = localStorage.getItem(STORAGE_TIME)
    let keyValue = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
    if (!lastUpdate || now - lastUpdate > 86400000 || Object.keys(keyValue).length === 0) {
        try {
            const res = await fetch(REMOTE_URL, { cache: "no-store" })
            if (res.ok) {
                keyValue = await res.json();
                localStorage.setItem(STORAGE_KEY, JSON.stringify(keyValue))
                localStorage.setItem(STORAGE_TIME, now)
            }
        } catch (err) {
            console.error("更新失敗，使用本機快取", err)
        }
    }
    return keyValue
}

(async () => {
    const keyValue = await getKeyValue()
    const bgmLink = document.createElement("a")
    bgmLink.target = "_blank"
    bgmLink.id = "bgmtv"
    function init_bgmlink() {
        if (keyValue[videoTitle] && keyValue[videoTitle].bgmId) {
            bgmUrl = "https://bgm.tv/subject/" + keyValue[videoTitle].bgmId
            bgmUrlAuto = bgmUrl + "?watch=" + videoEpisode
            bgmLink.innerText = "點格子  "
        } else {
            bgmUrl = "https://bgm.tv/subject_search/" + videoTitle + "?cat=all"
            bgmUrlAuto = bgmUrl
            bgmLink.innerText = "點格子?  "
        }
        bgmLink.href = bgmUrl
        const targetBtn = document.querySelector(".anime_name > button")
        if (targetBtn) targetBtn.insertAdjacentElement("afterend", bgmLink)
    }

    const css = document.createElement("style")
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
`
    document.body.append(css)



    // 延遲等待影片載入
    function init() {
        const videos = document.querySelectorAll('video');
        if (!videos.length) {
            setTimeout(init, 3000);
            return;
        }

        videos.forEach(video => {
            if (video.dataset.hasWatcher) return;
            video.dataset.hasWatcher = "true";

            video.addEventListener('pause', () => handlePause(video));
            video.addEventListener('ended', () => handleEnded(video));
        });
    }

    // 手動暫停時觸發（若進度 > 90%）
    function handlePause(video) {
        const percent = (video.currentTime / video.duration) * 100;
        const leftTime = (video.duration - video.currentTime);
        if (percent >= 90 && !video.dataset.prompted) {
            showPrompt(video);
        } else if (leftTime <= 90 && !video.dataset.prompted) {
            showPrompt(video);
        }
    }

    // 自動播完觸發
    function handleEnded(video) {
        if (!video.dataset.prompted) {
            showPrompt(video);
        }
    }

    // 顯示提示按鈕
    function showPrompt(video) {
        video.dataset.prompted = "true";

        const btn = document.createElement('button');
        btn.textContent = "✅ 儲存觀看記錄";
        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '30px',
            right: '30px',
            zIndex: 99999,
            padding: '12px 18px',
            fontSize: '16px',
            backgroundColor: '#2196f3',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        });

        btn.onclick = () => {
            btn.remove();
            // alert("將導向紀錄網站");
            window.open(bgmUrlAuto, '_blank');
        };

        document.body.appendChild(btn);
    }

    // 啟動
    init_bgmlink();
    window.addEventListener('load', init);

    function watchAnimeTitleChange(callback) {
        const target = document.querySelector('.anime_name h1');
        if (!target) {
            //console.warn('[BGM腳本] 找不到 anime_name h1，稍後再試...');
            setTimeout(() => watchAnimeTitleChange(callback), 1000);
            return;
        }

        let lastTitle = target.textContent.trim();

        const observer = new MutationObserver(() => {
            const newTitle = target.textContent.trim();
            if (newTitle !== lastTitle) {
                //console.log(`[BGM腳本] 標題變化: ${lastTitle} → ${newTitle}`);
                lastTitle = newTitle;
                callback(newTitle);
            }
        });
        observer.observe(target, {childList: true, characterData: true, subtree: true});
    }

    watchAnimeTitleChange(newTitle => {
        console.log('目前標題：', newTitle);
        videoTitle = newTitle.split(" [")[0];
        videoEpisode = newTitle.split(" [")[1].split("]")[0];
        init_bgmlink()
    });
})()

