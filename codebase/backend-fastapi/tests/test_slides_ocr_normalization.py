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


def test_normalize_ocr_text_with_openai_uses_json_response(monkeypatch):
    monkeypatch.setattr(
        slides,
        "get_settings",
        lambda: SimpleNamespace(
            openai_api_key="test-key",
            openai_api_url="https://example.test/chat/completions",
            openai_model="gpt-4.1-mini",
            openai_reasoning_effort="none",
        ),
    )
    monkeypatch.setattr(slides.urllib.request, "urlopen", lambda *_args, **_kwargs: _FakeResponse())

    result = slides.normalize_ocr_text_with_openai("T Ầ N G MO DEL\nV I Ệ C C Ủ A B Ạ N", page_number=3)

    assert result == "TẦNG MODEL\nViệc của bạn"


def test_normalize_ocr_text_with_openai_skips_without_api_key(monkeypatch):
    monkeypatch.setattr(
        slides,
        "get_settings",
        lambda: SimpleNamespace(
            openai_api_key=None,
            openai_api_url="https://example.test/chat/completions",
            openai_model="gpt-4.1-mini",
            openai_reasoning_effort="none",
        ),
    )

    assert slides.normalize_ocr_text_with_openai("T Ầ N G", page_number=1) == "T Ầ N G"
