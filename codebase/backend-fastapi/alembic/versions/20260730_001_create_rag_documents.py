"""Create pgvector-backed RAG document table.

Revision ID: 20260730_001
Revises:
Create Date: 2026-07-30
"""

from collections.abc import Sequence

from alembic import op


revision: str = "20260730_001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS rag_documents (
            id TEXT PRIMARY KEY,
            lesson_id TEXT NOT NULL,
            source_type TEXT NOT NULL,
            source_id TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            page_number INTEGER,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            embedding vector(1536),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS rag_documents_source_unique
        ON rag_documents (source_type, source_id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS rag_documents_lesson_source_idx
        ON rag_documents (lesson_id, source_type)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS rag_documents_content_fts_idx
        ON rag_documents USING GIN (to_tsvector('simple', content))
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS rag_documents_embedding_hnsw_idx
        ON rag_documents USING hnsw (embedding vector_cosine_ops)
        WHERE embedding IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS rag_documents")

