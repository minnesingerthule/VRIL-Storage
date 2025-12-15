from datetime import datetime

from pydantic import BaseModel, EmailStr


# ---------- Users ----------

class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserRead(BaseModel):
    id: int
    email: EmailStr
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Auth / JWT ----------

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: int | None = None


# ---------- Folders / Files ----------

class FolderRead(BaseModel):
    id: int
    name: str
    parentId: int | None
    trashed: bool
    originalParentId: int | None


class FolderCreate(BaseModel):
    name: str
    parentId: int | None = None


class FolderUpdate(BaseModel):
    trashed: bool | None = None
    parentId: int | None = None
    originalParentId: int | None = None


class FileRead(BaseModel):
    id: int
    name: str
    type: str
    ownerId: int
    parentId: int | None
    sizeBytes: int
    starred: bool
    isShared: bool
    trashed: bool
    originalParentId: int | None
    modifiedAt: datetime


class FileUpdate(BaseModel):
    starred: bool | None = None
    isShared: bool | None = None
    trashed: bool | None = None
    parentId: int | None = None
    originalParentId: int | None = None


class DriveState(BaseModel):
    rootFolderId: int
    folders: list[FolderRead]
    files: list[FileRead]
