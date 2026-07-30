import json
from types import SimpleNamespace

from app.services import slides


class _FakeResponse:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self) -> bytes:
        return json.dumps(
            {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {"pages": [{"page": 3, "text": "TẦNG MODEL\nViệc của bạn"}]}
                            )
                        }
                    }
                ]
            }
        ).encode("utf-8")


def test_normalize_ocr_text_with_deepseek_uses_json_response(monkeypatch):
    monkeypatch.setattr(
        slides,
        "get_settings",
        lambda: SimpleNamespace(
            deepseek_api_key="test-key",
            deepseek_api_url="https://example.test/chat/completions",
            deepseek_model="deepseek-chat",
        ),
    )
    monkeypatch.setattr(slides.urllib.request, "urlopen", lambda *_args, **_kwargs: _FakeResponse())

    result = slides.normalize_ocr_text_with_deepseek("T Ầ N G MO DEL\nV I Ệ C C Ủ A B Ạ N", page_number=3)

    assert result == "TẦNG MODEL\nViệc của bạn"


def test_normalize_ocr_text_with_deepseek_skips_without_api_key(monkeypatch):
    monkeypatch.setattr(
        slides,
        "get_settings",
        lambda: SimpleNamespace(
            deepseek_api_key=None,
            deepseek_api_url="https://example.test/chat/completions",
            deepseek_model="deepseek-chat",
        ),
    )

    assert slides.normalize_ocr_text_with_deepseek("T Ầ N G", page_number=1) == "T Ầ N G"
