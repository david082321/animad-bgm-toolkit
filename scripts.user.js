// ==UserScript==
// @name         動畫瘋-BGM.TV 點格子
// @namespace    AnimadWithBgmtv
// @version      0.1.4
// @description  點格子
// @author       david082321
// @match        https://ani.gamer.com.tw/animeVideo.php?*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ani.gamer.com.tw
// @grant        none
// @license      none
// ==/UserScript==

const videoTitle = document.title.split(" [")[0]
let bgmUrl = ""
const STORAGE_KEY = "bgmtv_keyValue"
const STORAGE_TIME = "bgmtv_lastUpdate"
const REMOTE_URL = `https://raw.githubusercontent.com/david082321/animad-bgm-toolkit/refs/heads/main/keyValue.json?t=${Date.now()}`

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
            console.error("更新 keyValue 失敗，使用本機快取", err)
        }
    }
    return keyValue
}

(async () => {
    const keyValue = await getKeyValue()
    const bgmLink = document.createElement("a")
    bgmLink.target = "_blank"
    bgmLink.id = "bgmtv"
    if (keyValue[videoTitle]) {
        bgmUrl = "https://bgm.tv/subject/" + keyValue[videoTitle]
        bgmLink.innerText = "點格子  "
    } else {
        bgmUrl = "https://bgm.tv/subject_search/" + videoTitle + "?cat=all"
        bgmLink.innerText = "點格子?  "
    }
    bgmLink.href = bgmUrl
    const targetBtn = document.querySelector(".anime_name > button")
    if (targetBtn) targetBtn.insertAdjacentElement("afterend", bgmLink)

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
})()

