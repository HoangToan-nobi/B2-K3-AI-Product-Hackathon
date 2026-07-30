from fastapi import Header, HTTPException, Query

from app.schemas.review_packs import AppRole


def get_request_role(
    role: str | None = Query(default=None),
    x_vluoi_role: str | None = Header(default=None),
) -> AppRole:
    return "labcoach" if (x_vluoi_role or role) == "labcoach" else "student"


def require_labcoach(current_role: AppRole) -> None:
    if current_role != "labcoach":
        raise HTTPException(status_code=403, detail={"error": "Lab Coach role required"})

