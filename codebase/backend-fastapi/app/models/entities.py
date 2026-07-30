from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "User"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str | None] = mapped_column(String)
    email: Mapped[str] = mapped_column(String, unique=True)
    role: Mapped[str] = mapped_column(String, default="student")
    created_at: Mapped[DateTime] = mapped_column("createdAt", DateTime, server_default=func.now())


class Course(Base):
    __tablename__ = "Course"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(String)
    owner_id: Mapped[str] = mapped_column("ownerId", String, ForeignKey("User.id"))
    created_at: Mapped[DateTime] = mapped_column("createdAt", DateTime, server_default=func.now())


class Lesson(Base):
    __tablename__ = "Lesson"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    course_id: Mapped[str] = mapped_column("courseId", String, ForeignKey("Course.id"))
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="draft")
    created_by: Mapped[str] = mapped_column("createdBy", String, ForeignKey("User.id"))
    created_at: Mapped[DateTime] = mapped_column("createdAt", DateTime, server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column("updatedAt", DateTime, server_default=func.now())

    slide_decks: Mapped[list["SlideDeck"]] = relationship(lazy="selectin")
    knowledge_packs: Mapped[list["KnowledgePack"]] = relationship(lazy="selectin")


class SlideDeck(Base):
    __tablename__ = "SlideDeck"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    lesson_id: Mapped[str] = mapped_column("lessonId", String, ForeignKey("Lesson.id"))
    original_filename: Mapped[str] = mapped_column("originalFilename", String)
    storage_key: Mapped[str] = mapped_column("storageKey", String)
    mime_type: Mapped[str] = mapped_column("mimeType", String)
    page_count: Mapped[int] = mapped_column("pageCount", Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="pending")
    uploaded_by: Mapped[str] = mapped_column("uploadedBy", String, ForeignKey("User.id"))
    created_at: Mapped[DateTime] = mapped_column("createdAt", DateTime, server_default=func.now())

    slide_pages: Mapped[list["SlidePage"]] = relationship(lazy="selectin")


class SlidePage(Base):
    __tablename__ = "SlidePage"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    deck_id: Mapped[str] = mapped_column("deckId", String, ForeignKey("SlideDeck.id"))
    page_number: Mapped[int] = mapped_column("pageNumber", Integer)
    text_content: Mapped[str | None] = mapped_column("textContent", Text)
    image_storage_key: Mapped[str | None] = mapped_column("imageStorageKey", String)
    thumbnail_storage_key: Mapped[str | None] = mapped_column("thumbnailStorageKey", String)
    created_at: Mapped[DateTime] = mapped_column("createdAt", DateTime, server_default=func.now())


class SlideChunk(Base):
    __tablename__ = "SlideChunk"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    page_id: Mapped[str | None] = mapped_column("pageId", String, ForeignKey("SlidePage.id"))
    deck_id: Mapped[str] = mapped_column("deckId", String, ForeignKey("SlideDeck.id"))
    lesson_id: Mapped[str] = mapped_column("lessonId", String, ForeignKey("Lesson.id"))
    chunk_index: Mapped[int] = mapped_column("chunkIndex", Integer)
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[str | None] = mapped_column(Text)
    token_count: Mapped[int] = mapped_column("tokenCount", Integer, default=0)
    metadata_: Mapped[str | None] = mapped_column("metadata", Text)
    created_at: Mapped[DateTime] = mapped_column("createdAt", DateTime, server_default=func.now())


class KnowledgePack(Base):
    __tablename__ = "KnowledgePack"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    lesson_id: Mapped[str] = mapped_column("lessonId", String, ForeignKey("Lesson.id"))
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String, default="draft")
    generated_by: Mapped[str | None] = mapped_column("generatedBy", String)
    generated_at: Mapped[DateTime | None] = mapped_column("generatedAt", DateTime)
    published_at: Mapped[DateTime | None] = mapped_column("publishedAt", DateTime)

    knowledge_items: Mapped[list["KnowledgeItem"]] = relationship(lazy="selectin")


class KnowledgeItem(Base):
    __tablename__ = "KnowledgeItem"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    pack_id: Mapped[str] = mapped_column("packId", String, ForeignKey("KnowledgePack.id"))
    type: Mapped[str] = mapped_column(String)
    title: Mapped[str | None] = mapped_column(String)
    content: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String, default="needs_review")
    metadata_: Mapped[str | None] = mapped_column("metadata", Text)
    created_at: Mapped[DateTime] = mapped_column("createdAt", DateTime, server_default=func.now())

