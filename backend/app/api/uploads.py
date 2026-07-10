"""Image upload route."""

from __future__ import annotations

import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.core.config import settings
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

# Only allow common image types.
_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
_ALLOWED_MIME = {"image/jpeg", "image/png", "image/gif", "image/webp"}

# Cap upload size so a single request can't exhaust server memory (the file is
# read fully into RAM before writing). 8 MB is generous for a chart screenshot.
_MAX_UPLOAD_BYTES = 8 * 1024 * 1024


@router.post("/")
@router.post("", include_in_schema=False)
async def upload_image(
    file: UploadFile = File(...),
    _user: User = Depends(get_current_user),
) -> dict:
    # Validate by content type and extension.
    ext = os.path.splitext(file.filename or "")[1].lower()
    if file.content_type not in _ALLOWED_MIME and ext not in _ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Only image uploads are allowed")
    if ext not in _ALLOWED_EXT:
        ext = ".png"  # safe default when only the MIME type was trustworthy

    contents = await file.read()
    if len(contents) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="حجم تصویر بیش از حد مجاز است (حداکثر ۸ مگابایت).")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(settings.UPLOAD_DIR, name)

    with open(path, "wb") as f:
        f.write(contents)

    return {"url": f"/uploads/{name}"}
