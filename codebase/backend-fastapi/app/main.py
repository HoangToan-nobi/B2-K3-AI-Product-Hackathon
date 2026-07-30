from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import chat, lessons, progress, review_packs
from app.core.config import get_settings


settings = get_settings()

app = FastAPI(title="VLuoi Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(review_packs.router)
app.include_router(lessons.router)
app.include_router(chat.router)
app.include_router(progress.router)
