from typing import Literal

from pydantic import BaseModel


AppRole = Literal["student", "labcoach"]


class CreateReviewPackRequest(BaseModel):
    lesson_id: str | None = None
    run_pipeline: bool = False


class UpdateReviewItemRequest(BaseModel):
    action: Literal["approve", "drop"]

