import unittest
from unittest.mock import Mock

import yaml

from update_anime_data import Anime, ApiClient, build_entries, find_new_anime, prepend_entries


def subject(id, name, name_cn=""):
    return {"id": id, "type": 2, "name": name, "name_cn": name_cn}


class BangumiMatchingTests(unittest.TestCase):
    def match(self, title, japanese, pages):
        client = ApiClient("fixture-only", timeout=1, delay=0)
        self.addCleanup(client.close)
        client.fetch_acg = Mock(return_value=(japanese, 22))
        client.request = Mock(side_effect=lambda method, url, **kwargs: Mock(
            json=lambda: pages[kwargs["json"]["keyword"]]
        ))
        return build_entries([Anime(title, 11, None)], client)[title]

    def test_unrelated_first_result_leaves_id_blank(self):
        row = self.match("攻殼機動隊 1995", "攻殻機動隊", {
            "攻殻機動隊": {"data": [subject(529143, "コウペンちゃん")]},
            "攻殼機動隊 1995": {"data": []},
        })
        self.assertEqual(row, {"bgmId": None, "acgId": 11, "aniId": 22})
        raw = b"# existing comment\nExisting:\n  bgmId: 42 # manually checked\n"
        updated = prepend_entries(raw, {"Candidate": row})
        self.assertIn(b"  bgmId:\n", updated)
        self.assertTrue(updated.endswith(b"Existing:\n  bgmId: 42 # manually checked\n"))
        self.assertIsNone(yaml.safe_load(updated)["Candidate"]["bgmId"])

    def test_punctuation_preserves_movie_version_and_sequel_discriminators(self):
        row = self.match("ＷＯＲＫＩＮＧ！ ！ ！", None, {
            "ＷＯＲＫＩＮＧ！ ！ ！": {"data": [
                subject(176599, "WWW.WORKING!!"),
                subject(4255, "WORKING!!"),
                subject(20547, "WORKING'!!"),
                subject(110648, "WORKING!!!"),
            ]},
        })
        self.assertEqual(row["bgmId"], 110648)

    def test_checks_both_localized_titles_and_agrees_on_id(self):
        row = self.match("迷糊餐廳", "WORKING!!", {
            "WORKING!!": {"data": [subject(4255, "WORKING!!", "迷糊餐廳")]},
            "迷糊餐廳": {"data": [subject(4255, "WORKING!!", "迷糊餐廳")]},
        })
        self.assertEqual(row["bgmId"], 4255)

    def test_one_unique_exact_match_can_follow_unrelated_japanese_results(self):
        row = self.match("迷糊餐廳", "WORKING!!", {
            "WORKING!!": {"data": [subject(176599, "WWW.WORKING!!")]},
            "迷糊餐廳": {"data": [subject(4255, "WORKING!!", "迷糊餐廳")]},
        })
        self.assertEqual(row["bgmId"], 4255)

    def test_conflicting_titles_and_same_name_remakes_are_ambiguous(self):
        for extra in (subject(2, "Another", "本地片名"), subject(2, "同名原題")):
            with self.subTest(extra=extra):
                row = self.match("本地片名", "同名原題", {
                    "同名原題": {"data": [subject(1, "同名原題"), extra]},
                    "本地片名": {"data": [extra]},
                })
                self.assertIsNone(row["bgmId"])

    def test_incomplete_search_cannot_rule_out_ambiguity(self):
        row = self.match("迷糊餐廳", "WORKING!!", {
            "WORKING!!": {"total": 51, "data": [subject(4255, "WORKING!!")]},
            "迷糊餐廳": {"total": 1, "data": [subject(4255, "WORKING!!", "迷糊餐廳")]},
        })
        self.assertIsNone(row["bgmId"])

    def test_existing_blank_and_manual_ids_are_both_preserved(self):
        existing = {
            "Accepted": {"bgmId": 42, "acgId": 1},
            "Pending": {"bgmId": None, "aniId": 4},
        }
        anime = [Anime("Accepted", 5, None), Anime("Alias", 1, None),
                 Anime("Pending alias", 2, 4), Anime("New", 3, None)]
        self.assertEqual(find_new_anime(anime, existing), [anime[-1]])


if __name__ == "__main__":
    unittest.main()
