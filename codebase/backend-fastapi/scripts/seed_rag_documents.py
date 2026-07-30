import asyncio
import json
from pathlib import Path

from sqlalchemy import text

from app.core.database import engine
from app.core.paths import SHARED_DIR


UPSERT_SQL = text(
    """
    INSERT INTO rag_documents (
        id, lesson_id, source_type, source_id, title, content, page_number, metadata, updated_at
    )
    VALUES (
        :id, :lesson_id, :source_type, :source_id, :title, :content, :page_number,
        CAST(:metadata AS jsonb), now()
    )
    ON CONFLICT (id) DO UPDATE SET
        lesson_id = EXCLUDED.lesson_id,
        source_type = EXCLUDED.source_type,
        source_id = EXCLUDED.source_id,
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        page_number = EXCLUDED.page_number,
        metadata = EXCLUDED.metadata,
        updated_at = now()
    """
)


def _metadata(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False)


def slide_documents() -> list[dict]:
    path = SHARED_DIR / "slide-day1-foundation.json"
    slide = json.loads(path.read_text(encoding="utf-8"))
    docs = []
    for page in slide.get("pages", []):
        docs.append(
            {
                "id": f"slide:day1-foundation:{page['page']}",
                "lesson_id": "day1-foundation",
                "source_type": "slide",
                "source_id": f"artifact-slide-{page['page']}",
                "title": f"Slide {page['page']}",
                "content": page["text"],
                "page_number": page["page"],
                "metadata": _metadata({"source_file": str(path)}),
            }
        )
    return docs


async def db_documents() -> list[dict]:
    if engine is None:
        return []
    async with engine.connect() as conn:
        transcripts = (
            await conn.execute(
                text(
                    """
                    SELECT id, "lessonId", filename, content
                    FROM "Transcript"
                    ORDER BY filename
                    """
                )
            )
        ).mappings().all()
        questions = (
            await conn.execute(
                text(
                    """
                    SELECT id, "lessonId", message
                    FROM "StudentQuestion"
                    ORDER BY "createdAt", id
                    """
                )
            )
        ).mappings().all()

    docs = [
        {
            "id": f"transcript:{row['id']}",
            "lesson_id": row["lessonId"],
            "source_type": "transcript",
            "source_id": str(row["id"]),
            "title": row["filename"],
            "content": row["content"],
            "page_number": None,
            "metadata": _metadata({"filename": row["filename"]}),
        }
        for row in transcripts
    ]
    docs.extend(
        {
            "id": f"chat_history:{row['id']}",
            "lesson_id": row["lessonId"],
            "source_type": "chat_history",
            "source_id": str(row["id"]),
            "title": "Student question",
            "content": row["message"],
            "page_number": None,
            "metadata": _metadata({}),
        }
        for row in questions
        if row["message"]
    )
    return docs


async def main() -> None:
    if engine is None:
        raise RuntimeError("DATABASE_URL is required")
    docs = [*slide_documents(), *(await db_documents())]
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                DELETE FROM rag_documents
                WHERE source_type IN ('slide', 'transcript', 'chat_history')
                """
            )
        )
        await conn.execute(UPSERT_SQL, docs)
    print(f"Seeded rag_documents: {len(docs)}")


if __name__ == "__main__":
    asyncio.run(main())
