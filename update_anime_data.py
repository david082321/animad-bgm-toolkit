#!/usr/bin/env python3
"""從動畫瘋首頁新增 YAML 條目，保留原檔所有內容與註釋。"""

import argparse
from dataclasses import dataclass, replace
import logging
import os
from pathlib import Path
import re
import sys
import tempfile
import time
import unicodedata
from urllib.parse import parse_qs, urljoin, urlparse

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup
import yaml


INDEX_URL = "https://api.gamer.com.tw/mobile_app/anime/v4/index.php"
ACG_URL = "https://acg.gamer.com.tw/acgDetail.php"
BGM_SEARCH_URL = "https://api.bgm.tv/v0/search/subjects"
USER_AGENT = (
    "david082321/animad-bgm-toolkit/1.0.0 "
    "(https://github.com/david082321/animad-bgm-toolkit)"
)
DEFAULT_YAML = Path(__file__).resolve().with_name("animeData.yaml")
LOG = logging.getLogger(__name__)


@dataclass(frozen=True)
class Anime:
    title: str
    acg_id: int
    ani_id: int | None


def positive_id(value) -> int | None:
    """API 的 ID 可能是字串；0、空值和非整數都不當作有效 ID。"""
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        return None
    try:
        result = int(value)
    except ValueError:
        return None
    return result if result > 0 else None


def clean_title(title: str) -> str:
    return re.sub(r"\s*\[年齡限制版\]\s*$", "", title).strip()


def matching_title(title: str) -> str:
    title = unicodedata.normalize("NFKC", clean_title(title)).casefold()
    return "".join(char for char in title if char.isalnum())


def parse_index(payload: dict) -> list[Anime]:
    """新番依 API 更新順序排列，再補上最近上架、尚未出現的作品。"""
    try:
        data = payload["data"]
        recent = data["newAnime"]["date"]
        added = data.get("newAdded", [])
    except (KeyError, TypeError, AttributeError) as exc:
        raise ValueError("動畫瘋首頁 API 結構不符：缺少 data.newAnime.date") from exc
    if not isinstance(recent, list) or not isinstance(added, list):
        raise ValueError("動畫瘋首頁 API 的 newAnime.date / newAdded 必須是陣列")

    anime_by_acg = {}
    for item in recent + added:
        if not isinstance(item, dict):
            raise ValueError("動畫瘋首頁 API 包含非物件的動畫資料")
        title = item.get("title")
        acg_id = positive_id(item.get("acgSn"))
        if not isinstance(title, str) or not clean_title(title) or acg_id is None:
            LOG.warning("略過缺少標題或 acgSn 的資料：%s", item)
            continue
        anime = Anime(clean_title(title), acg_id, positive_id(item.get("videoSn")))
        previous = anime_by_acg.get(acg_id)
        if previous is None:
            anime_by_acg[acg_id] = anime
        elif previous.ani_id is None and anime.ani_id is not None:
            anime_by_acg[acg_id] = replace(previous, ani_id=anime.ani_id)
    return list(anime_by_acg.values())


def find_new_anime(anime_list: list[Anime], existing: dict) -> list[Anime]:
    known_titles = {clean_title(title) for title in existing}
    known_acg = set()
    known_ani = set()

    def remember_ids(item):
        if not isinstance(item, dict):
            return
        for field, known in (("acgId", known_acg), ("aniId", known_ani)):
            item_id = positive_id(item.get(field))
            if item_id is not None:
                known.add(item_id)
        for part in item.get("parts") or []:
            remember_ids(part)

    for item in existing.values():
        remember_ids(item)

    new = []
    for anime in anime_list:
        if (
            anime.title in known_titles
            or anime.acg_id in known_acg
            or (anime.ani_id is not None and anime.ani_id in known_ani)
        ):
            continue
        new.append(anime)
        known_titles.add(anime.title)
        known_acg.add(anime.acg_id)
        if anime.ani_id is not None:
            known_ani.add(anime.ani_id)
    return new


def parse_acg_details(html: str) -> tuple[str | None, int | None]:
    soup = BeautifulSoup(html, "html.parser")
    info = soup.select_one(".ACG-info-container")
    if info is None:
        raise ValueError("ACG 頁面缺少 .ACG-info-container，無法辨識作品資料")
    heading = info.select_one("h2")
    japanese_title = heading.get_text(" ", strip=True) if heading else None
    ani_id = None
    for link in soup.select('a[href*="animeVideo.php"]'):
        url = urlparse(urljoin(ACG_URL, link["href"]))
        if url.hostname != "ani.gamer.com.tw":
            continue
        ani_id = positive_id(parse_qs(url.query).get("sn", [None])[0])
        if ani_id is not None:
            break
    return japanese_title or None, ani_id


class ApiClient:
    def __init__(self, user_agent: str, timeout: float, delay: float):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": user_agent})
        retry = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=frozenset(("GET", "POST")),
            respect_retry_after_header=True,
        )
        self.session.mount("https://", HTTPAdapter(max_retries=retry))
        self.timeout = timeout
        self.delay = delay
        self.last_request = None

    def close(self):
        self.session.close()

    def request(self, method: str, url: str, **kwargs) -> requests.Response:
        if self.last_request is not None:
            remaining = self.delay - (time.monotonic() - self.last_request)
            if remaining > 0:
                time.sleep(remaining)
        try:
            response = self.session.request(method, url, timeout=self.timeout, **kwargs)
            response.raise_for_status()
            return response
        finally:
            self.last_request = time.monotonic()

    def fetch_index(self) -> list[Anime]:
        return parse_index(self.request("GET", INDEX_URL).json())

    def fetch_acg(self, acg_id: int) -> tuple[str | None, int | None]:
        response = self.request("GET", ACG_URL, params={"s": acg_id})
        response.encoding = "utf-8"
        return parse_acg_details(response.text)

    def search_bangumi(self, keyword: str) -> int | None:
        response = self.request(
            "POST",
            BGM_SEARCH_URL,
            params={"limit": 10, "offset": 0},
            json={"keyword": keyword, "sort": "match", "filter": {"type": [2]}},
        )
        payload = response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
            raise ValueError("Bangumi 搜尋回應缺少 data 陣列")
        results = payload["data"]
        if not results:
            return None
        if any(
            not isinstance(item, dict)
            or positive_id(item.get("id")) is None
            or item.get("type") != 2
            for item in results
        ):
            raise ValueError("Bangumi 搜尋回應包含無效的動畫條目")
        # 同一頁中優先完全相同的標題；否則使用 match 排序的第一筆。
        for item in results:
            for field in ("name", "name_cn"):
                name = item.get(field)
                if isinstance(name, str) and matching_title(name) == matching_title(keyword):
                    return positive_id(item["id"])
        return positive_id(results[0]["id"])


def build_entries(anime_list: list[Anime], client: ApiClient) -> dict:
    entries = {}
    for anime in anime_list:
        LOG.info("查詢 %s (acgId=%s)", anime.title, anime.acg_id)
        japanese_title, acg_ani_id = client.fetch_acg(anime.acg_id)
        bgm_id = None
        keywords = dict.fromkeys(title for title in (japanese_title, anime.title) if title)
        for keyword in keywords:
            bgm_id = client.search_bangumi(keyword)
            LOG.info("  搜尋 %r → %s", keyword, bgm_id if bgm_id is not None else "無結果")
            if bgm_id is not None:
                break
        ani_id = anime.ani_id or acg_ani_id
        if ani_id is None:
            LOG.warning("  未找到播放 ID，aniId 留空")
        entries[anime.title] = {"bgmId": bgm_id, "acgId": anime.acg_id, "aniId": ani_id}
    return entries


class BlankNullDumper(yaml.SafeDumper):
    """空 ID 輸出為 `bgmId:`，讀取時仍是 YAML null。"""


BlankNullDumper.add_representer(
    type(None), lambda dumper, value: dumper.represent_scalar("tag:yaml.org,2002:null", "")
)


def dump_entries(entries: dict, newline: str = "\n") -> str:
    return yaml.dump(
        entries, Dumper=BlankNullDumper, allow_unicode=True, sort_keys=False, width=4096
    ).replace("\n", newline)


def load_existing(raw: bytes) -> tuple[str, dict, int]:
    text = raw.decode("utf-8-sig")
    root = yaml.compose(text, Loader=yaml.SafeLoader)
    data = yaml.safe_load(text)
    if root is None or (
        isinstance(root, yaml.ScalarNode)
        and root.tag == "tag:yaml.org,2002:null"
        and root.value == ""
    ):
        # 空文件若有 YAML 結束標記，必須將新條目插入標記之前。
        end_marker = re.search(r"(?m)^\.\.\.(?:\s|$)", text)
        return text, {}, end_marker.start() if end_marker else len(text)
    if not isinstance(root, yaml.MappingNode) or root.flow_style:
        raise ValueError("animeData.yaml 必須使用區塊格式的頂層 mapping")
    if not isinstance(data, dict) or any(not isinstance(title, str) for title in data):
        raise ValueError("animeData.yaml 的條目名稱必須是字串")
    if len(root.value) != len(data):
        raise ValueError("animeData.yaml 存在重複的條目名稱，請先修正")
    first_key = root.value[0][0]
    insertion = sum(len(line) for line in text.splitlines(keepends=True)[:first_key.start_mark.line])
    return text, data, insertion


def prepend_entries(raw: bytes, entries: dict) -> bytes:
    if not entries:
        return raw
    text, existing, insertion = load_existing(raw)
    if existing.keys() & entries.keys():
        raise ValueError("新條目與既有 YAML 名稱重複，取消寫入")
    newline = "\r\n" if "\r\n" in text else "\n"
    header = text[:insertion]
    if header and not header.endswith(("\r", "\n")):
        header += newline
    updated = header + dump_entries(entries, newline) + text[insertion:]
    # 只序列化新條目，原檔內容（包含 inline 註釋）維持原樣。
    yaml.safe_load(updated)
    bom = b"\xef\xbb\xbf" if raw.startswith(b"\xef\xbb\xbf") else b""
    return bom + updated.encode("utf-8")


def save_atomically(path: Path, expected: bytes, updated: bytes):
    """先完成全部查詢再替換；檔案若在查詢期間被編輯，就取消寫入。"""
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as f:
            temporary = Path(f.name)
            f.write(updated)
            f.flush()
            os.fsync(f.fileno())
        if path.read_bytes() != expected:
            raise ValueError("animeData.yaml 在查詢期間已被修改，取消寫入，請重新執行")
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def nonnegative_number(value: str) -> float:
    number = float(value)
    if not 0 <= number < float("inf"):
        raise argparse.ArgumentTypeError("必須是有限的非負數")
    return number


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--yaml", type=Path, default=DEFAULT_YAML, help="YAML 路徑，預設為腳本旁的 animeData.yaml")
    parser.add_argument("--dry-run", action="store_true", help="查詢並顯示新增條目，不寫入檔案")
    parser.add_argument("--limit", type=int, help="本次最多新增幾部作品")
    parser.add_argument("--user-agent", default=USER_AGENT, help="Bangumi User-Agent，應包含個人 ID、應用名稱與專案首頁")
    parser.add_argument("--timeout", type=nonnegative_number, default=25, help="每次 HTTP 請求逾時秒數（預設 25）")
    parser.add_argument("--delay", type=nonnegative_number, default=0.5, help="相鄰 HTTP 請求間隔秒數（預設 0.5）")
    args = parser.parse_args(argv)
    if args.limit is not None and args.limit <= 0:
        parser.error("--limit 必須大於 0")
    if args.timeout == 0:
        parser.error("--timeout 必須大於 0")
    if not args.user_agent.strip():
        parser.error("--user-agent 不可為空")

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    client = ApiClient(args.user_agent, args.timeout, args.delay)
    try:
        path = args.yaml.resolve()
        raw = path.read_bytes()
        _, existing, _ = load_existing(raw)
        anime_list = client.fetch_index()
        new = find_new_anime(anime_list, existing)
        if args.limit is not None:
            new = new[:args.limit]
        if not new:
            LOG.info("首頁 %s 部作品均已存在，無需更新。", len(anime_list))
            return 0
        entries = build_entries(new, client)
        updated = prepend_entries(raw, entries)
        if args.dry_run:
            sys.stdout.write(dump_entries(entries))
            LOG.info("預覽 %s 部新作品；未寫入檔案。", len(entries))
        else:
            save_atomically(path, raw, updated)
            LOG.info("已將 %s 部新作品加入 %s 的開頭。", len(entries), path)
        return 0
    except (OSError, ValueError, requests.RequestException, yaml.YAMLError) as exc:
        LOG.error("更新失敗，未寫入新資料：%s", exc)
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
