from app.services.llm import LlmService


def test_tutor_answer_does_not_expose_context_label():
    answer = LlmService._clean_tutor_answer(
        'Dựa trên CONTEXT, model không đọc "từ" nguyên vẹn mà xử lý bằng token.'
    )

    assert answer == 'model không đọc "từ" nguyên vẹn mà xử lý bằng token.'
    assert "CONTEXT" not in answer
