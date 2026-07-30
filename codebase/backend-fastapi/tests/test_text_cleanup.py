from app.services.text_cleanup import strip_markdown_text


def test_strip_markdown_text_keeps_plain_vietnamese_content():
    text = """**RLHF khác gì so với huấn luyện thông thường?**

- **Pre-training:** Model học từ dữ liệu lớn.
- **RLHF:** Model học thêm từ phản hồi của con người.
"""

    cleaned = strip_markdown_text(text)

    assert cleaned == (
        "RLHF khác gì so với huấn luyện thông thường? "
        "Pre-training: Model học từ dữ liệu lớn. "
        "RLHF: Model học thêm từ phản hồi của con người."
    )
    assert "**" not in cleaned
    assert "- **" not in cleaned
