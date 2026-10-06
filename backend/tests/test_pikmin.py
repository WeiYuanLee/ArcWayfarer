import base64
import gzip
import html
import json
import unittest
from threading import RLock
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import HTTPException

from api import pikmin as pikmin_api
from core.pikmin import PikminRepository
from models.schemas import PikminPostcard, PikminPureSpot
from services.pikmin_sync import is_allowed_postcard_image_url, parse_postcards, parse_purespots, postcard_page_count


class PikminParserTests(unittest.TestCase):
    def test_removes_a_postcard_that_no_longer_exists_at_the_source(self) -> None:
        repository = PikminRepository.__new__(PikminRepository)
        repository._lock = RLock()
        repository._postcards = [
            PikminPostcard(id=519, name="已刪除", type="mushroom", image_url="https://pikmin.talllkai.com/uploads/postcards/deleted.jpg", description="", country="台灣", lat=23, lng=120, date="", submitter="", likes=0),
        ]
        repository._purespots = []

        with patch("core.pikmin.safe_write_json") as write_json:
            self.assertTrue(repository.remove_postcard(519))

        self.assertIsNone(repository.postcard(519))
        write_json.assert_called_once()
        self.assertEqual(write_json.call_args.args[1], [])

    def test_random_purespot_only_returns_the_selected_type(self) -> None:
        repository = PikminRepository.__new__(PikminRepository)
        repository._lock = RLock()
        repository._purespots = [
            PikminPureSpot(id=1, name="公園 A", lat=25, lng=121, type="公園", icon="🌳", city="", district="", good=0, user_name="", update_date=None, ext=None),
            PikminPureSpot(id=2, name="咖啡 A", lat=24, lng=120, type="咖啡", icon="☕", city="", district="", good=0, user_name="", update_date=None, ext=None),
        ]

        self.assertEqual(repository.random_purespot("咖啡").id, 2)
        self.assertIsNone(repository.random_purespot("不存在"))

    def test_postcard_image_proxy_only_accepts_source_uploads(self) -> None:
        self.assertTrue(is_allowed_postcard_image_url(
            "https://pikmin.talllkai.com/uploads/postcards/example.jpg"
        ))
        self.assertFalse(is_allowed_postcard_image_url(
            "https://pikmin.talllkai.com.evil.example/uploads/postcards/example.jpg"
        ))
        self.assertFalse(is_allowed_postcard_image_url(
            "https://pikmin.talllkai.com/images/og-default.png"
        ))
        self.assertFalse(is_allowed_postcard_image_url("file:///etc/passwd"))

    def test_parses_postcard_cards_and_page_count(self) -> None:
        page = """
        <div class="pc-card" id="pc-444">
          <div class="pc-img-wrap"><img src="/uploads/postcards/test.jpg" alt="龍貓" /></div>
          <div class="pc-name-row"><h6>龍貓等公車</h6><span class="pc-type-badge pc-type-mushroom">🍄 菇</span></div>
          <p class="pc-desc">可愛的畫面</p>
          <span class="pc-country">🌏 馬來西亞</span>
          <span class="coord-chip" data-lat="3.382400" data-lon="101.774482"></span>
          <div class="pc-date-row"><span>📅 2026/09/05</span><span>👤 JDHG</span></div>
          <span class="like-count">3</span>
        </div>
        <a href="/Postcard?page=2">2</a>
        <span>第 1 / 26 頁</span>
        """
        items = parse_postcards(page)

        self.assertEqual(postcard_page_count(page), 26)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].model_dump(), {
            "id": 444,
            "name": "龍貓等公車",
            "type": "mushroom",
            "image_url": "https://pikmin.talllkai.com/uploads/postcards/test.jpg",
            "description": "可愛的畫面",
            "country": "馬來西亞",
            "lat": 3.3824,
            "lng": 101.774482,
            "date": "2026/09/05",
            "submitter": "JDHG",
            "likes": 3,
        })

    def test_decodes_embedded_purespot_payload(self) -> None:
        source = [{
            "Id": 3153,
            "Name": "台3丙線1197-1",
            "Lat": 23.814006,
            "Lon": 120.732973,
            "Type": "郵局",
            "Icon": "📮",
            "City": "南投縣",
            "District": "竹山鎮",
            "Good": 0,
            "UserName": "聖王",
            "UpdateDate": "2026-05-29T09:37:07.6",
            "Ext": None,
        }]
        encoded = base64.b64encode(gzip.compress(json.dumps(source, ensure_ascii=False).encode())).decode()
        page = f"<script>const b = Uint8Array.from(atob({json.dumps(encoded)}), c => c.charCodeAt(0));</script>"

        items = parse_purespots(html.unescape(page))

        self.assertEqual(len(items), 1)
        self.assertEqual((items[0].id, items[0].lng, items[0].type), (3153, 120.732973, "郵局"))


class PikminImageTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_source_image_removes_the_stale_postcard(self) -> None:
        postcard = PikminPostcard(id=519, name="已刪除", type="mushroom", image_url="https://pikmin.talllkai.com/uploads/postcards/deleted.jpg", description="", country="台灣", lat=23, lng=120, date="", submitter="", likes=0)
        request = httpx.Request("GET", postcard.image_url)
        response = httpx.Response(404, request=request)
        missing = httpx.HTTPStatusError("Not Found", request=request, response=response)

        with (
            patch.object(pikmin_api.pikmin_repository, "postcard", return_value=postcard),
            patch.object(pikmin_api.pikmin_repository, "remove_postcard") as remove_postcard,
            patch.object(pikmin_api, "fetch_postcard_image", AsyncMock(side_effect=missing)),
        ):
            with self.assertRaises(HTTPException) as raised:
                await pikmin_api.get_postcard_image(postcard.id)

        self.assertEqual(raised.exception.status_code, 404)
        remove_postcard.assert_called_once_with(postcard.id)


if __name__ == "__main__":
    unittest.main()
