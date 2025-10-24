# 動畫瘋 → BGM.TV 點格子
提供動畫瘋與 bgm.tv 條目的對應關係，並透過 Userscript 直接在播放頁顯示「點格子」連結。

## 安裝
1. [動畫瘋-BGM.TV 點格子](https://github.com/david082321/animad-bgm-toolkit/raw/refs/heads/main/scripts.user.js)
2. [BGM.TV 自動更新觀看進度](https://github.com/david082321/animad-bgm-toolkit/raw/refs/heads/main/scripts2.user.js)

## 使用
1. 只安裝第一個腳本：
    * 在動畫瘋播放頁面的訂閱按鈕旁邊加上「點格子」文字按鈕
    * 影片播放至90%或少於90秒，在右下角新增「儲存觀看記錄」按鈕
    * 上述兩個按鈕，按下後自動跳至 Bangumi 的對應條目
2. 加裝第二個腳本：
    * 當按下第一個腳本的「儲存觀看記錄」按鈕之後，除了自動打開 Bangumi 的對應條目
    * 還會自動點該集已觀看，並關閉 Bangumi 頁面
3. 其他用法：
    1. [Bangumi第三方客户端](https://github.com/czy0729/Bangumi/releases) 的源頭（在詳情頁面跳轉到動畫瘋APP播放頁）
       * 設定->其他->源頭->動畫->添加動畫源頭
       * 名字：`動畫瘋`
       * 網址：`https://animad-bgm-toolkit.pages.dev/?id=[ID]&name=[CN_S2T]`

## 常見問題
1. 不會自動跳到正確的頁面，而是搜尋頁
    * 請協助貢獻 [animeData.yaml](https://github.com/david082321/animad-bgm-toolkit/blob/main/animeData.yaml)
2. 其他
    * 請到 [issue](https://github.com/david082321/animad-bgm-toolkit/issues) 提問

## Credit
* 主要程式碼從 https://greasyfork.org/scripts/490463 的程式碼修改而來
* 87% 以上程式碼來自 AI
