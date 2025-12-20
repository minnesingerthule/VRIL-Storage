from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class UserCreate(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    id: int
    email: str
    created_at: datetime
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class FolderCreate(BaseModel):
    name: str
    parentId: Optional[int] = None

class FolderUpdate(BaseModel):
    trashed: Optional[bool] = None
    parentId: Optional[int] = None
    originalParentId: Optional[int] = None

class FileUpdate(BaseModel):
    starred: Optional[bool] = None
    isShared: Optional[bool] = None
    trashed: Optional[bool] = None
    parentId: Optional[int] = None
    originalParentId: Optional[int] = None

class FolderOut(BaseModel):
    id: int
    name: str
    parentId: Optional[int] = None
    trashed: bool
    originalParentId: Optional[int] = None
    
    class Config:
        from_attributes = True
        populate_by_name = True

class FileOut(BaseModel):
    id: int
    name: str
    type: str
    ownerId: int
    parentId: Optional[int] = None
    sizeBytes: int
    starred: bool
    isShared: bool
    trashed: bool
    originalParentId: Optional[int] = None
    modifiedAt: datetime

    class Config:
        from_attributes = True

class DriveState(BaseModel):
    rootFolderId: int
    folders: List[FolderOut]
    files: List[FileOut]