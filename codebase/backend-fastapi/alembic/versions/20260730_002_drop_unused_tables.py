"""Drop unused tables: ChatlogImport, Citation, Conversation, ChatMessage, IngestionJob, rag_documents.

These tables exist in the Prisma schema and/or an earlier migration but are not
referenced in any backend service, repository, or route.

Revision ID: 20260730_002
Revises: 20260730_001
Create Date: 2026-07-30
"""

from collections.abc import Sequence

from alembic import op


revision: str = "20260730_002"
down_revision: str | None = "20260730_001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "ChatlogImport" CASCADE')
    op.execute('DROP TABLE IF EXISTS "Citation" CASCADE')
    op.execute('DROP TABLE IF EXISTS "ChatMessage" CASCADE')
    op.execute('DROP TABLE IF EXISTS "Conversation" CASCADE')
    op.execute('DROP TABLE IF EXISTS "IngestionJob" CASCADE')
    op.execute("DROP TABLE IF EXISTS rag_documents CASCADE")
    op.execute("DROP INDEX IF EXISTS rag_documents_source_unique")
    op.execute("DROP INDEX IF EXISTS rag_documents_lesson_source_idx")
    op.execute("DROP INDEX IF EXISTS rag_documents_content_fts_idx")
    op.execute("DROP INDEX IF EXISTS rag_documents_embedding_hnsw_idx")


def downgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "IngestionJob" (
            id TEXT PRIMARY KEY,
            "lessonId" TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "Conversation" (
            id TEXT PRIMARY KEY,
            "lessonId" TEXT,
            "userId" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "ChatMessage" (
            id TEXT PRIMARY KEY,
            "conversationId" TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "Citation" (
            id TEXT PRIMARY KEY,
            "slideChunkId" TEXT,
            "studentQuestionId" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "ChatlogImport" (
            id TEXT PRIMARY KEY,
            "lessonId" TEXT NOT NULL,
            filename TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
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
