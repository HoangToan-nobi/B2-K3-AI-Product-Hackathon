from app.services.cloud_storage import _clean_public_id, _parse_cloudinary_url


def test_parse_cloudinary_url_extracts_credentials():
    credentials = _parse_cloudinary_url("cloudinary://api-key:api-secret@example-cloud")

    assert credentials == {
        "cloud_name": "example-cloud",
        "api_key": "api-key",
        "api_secret": "api-secret",
    }


def test_clean_public_id_keeps_extension_and_removes_path():
    assert _clean_public_id("../Day 2 tổng hợp.pdf") == "Day-2-t-ng-h-p.pdf"
