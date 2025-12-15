import os
import shutil
from pathlib import Path
from typing import Annotated

from fastapi import (
    Depends,
    FastAPI,
    File as FastFile,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from .database import Base, engine
from . import auth, models, schemas

load_dotenv()
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Drive API (FastAPI + Postgres)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DBDep = auth.DBDep
CurrentUser = Annotated[models.User, Depends(auth.get_current_user)]

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def ensure_root_folder(user: models.User, db: Session) -> models.Folder:
  # root = папка без parent_id и не в корзине
  root = db.scalar(
      select(models.Folder)
      .where(models.Folder.user_id == user.id)
      .where(models.Folder.parent_id.is_(None))
      .where(models.Folder.trashed.is_(False))
  )
  if root:
      return root
  root = models.Folder(
      user_id=user.id,
      name="Мой диск",
      parent_id=None,
      trashed=False,
  )
  db.add(root)
  db.commit()
  db.refresh(root)
  return root


# ---------- Auth ----------

@app.post("/auth/register", response_model=schemas.UserRead, status_code=201)
def register_user(body: schemas.UserCreate, db: DBDep):
    existing = db.scalar(select(models.User).where(models.User.email == body.email))
    if existing:
        raise HTTPException(status_code=400, detail="Пользователь уже существует")

    user = models.User(
        email=body.email,
        hashed_password=auth.get_password_hash(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    ensure_root_folder(user, db)

    return user


@app.post("/auth/login", response_model=schemas.Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: DBDep = Depends(),
):
    user = db.scalar(
        select(models.User).where(models.User.email == form_data.username)
    )
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
        )
    token = auth.create_access_token({"sub": str(user.id)})
    return schemas.Token(access_token=token)


@app.get("/auth/me", response_model=schemas.UserRead)
def get_me(current_user: CurrentUser):
    return current_user


# ---------- Drive state ----------

@app.get("/drive/state", response_model=schemas.DriveState)
def get_drive_state(current_user: CurrentUser, db: DBDep):
    root = ensure_root_folder(current_user, db)

    folders_db = db.scalars(
        select(models.Folder).where(models.Folder.user_id == current_user.id)
    ).all()
    files_db = db.scalars(
        select(models.File).where(models.File.owner_id == current_user.id)
    ).all()

    folders = [
        schemas.FolderRead(
            id=f.id,
            name=f.name,
            parentId=f.parent_id,
            trashed=f.trashed,
            originalParentId=f.original_parent_id,
        )
        for f in folders_db
    ]
    files = [
        schemas.FileRead(
            id=file.id,
            name=file.original_name,
            type=_infer_type(file.original_name),
            ownerId=file.owner_id,
            parentId=file.folder_id,
            sizeBytes=file.size_bytes,
            starred=file.starred,
            isShared=file.is_shared,
            trashed=file.trashed,
            originalParentId=file.original_folder_id,
            modifiedAt=file.updated_at,
        )
        for file in files_db
    ]

    return schemas.DriveState(
        rootFolderId=root.id,
        folders=folders,
        files=files,
    )


# ---------- Folders ----------

@app.post("/drive/folders", response_model=schemas.FolderRead, status_code=201)
def create_folder(
    body: schemas.FolderCreate,
    current_user: CurrentUser,
    db: DBDep,
):
    root = ensure_root_folder(current_user, db)
    parent_id = body.parentId if body.parentId is not None else root.id

    parent = db.get(models.Folder, parent_id)
    if not parent or parent.user_id != current_user.id:
        raise HTTPException(status_code=400, detail="Некорректная родительская папка")

    folder = models.Folder(
        user_id=current_user.id,
        name=body.name.strip(),
        parent_id=parent_id,
        trashed=False,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)

    return schemas.FolderRead(
        id=folder.id,
        name=folder.name,
        parentId=folder.parent_id,
        trashed=folder.trashed,
        originalParentId=folder.original_parent_id,
    )


@app.patch("/drive/folders/{folder_id}", response_model=schemas.FolderRead)
def update_folder(
    folder_id: int,
    body: schemas.FolderUpdate,
    current_user: CurrentUser,
    db: DBDep,
):
    folder = db.get(models.Folder, folder_id)
    if not folder or folder.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Папка не найдена")

    if body.trashed is not None:
        folder.trashed = body.trashed
    if body.parentId is not None:
        folder.parent_id = body.parentId
    if body.originalParentId is not None:
        folder.original_parent_id = body.originalParentId

    from .models import utcnow

    folder.updated_at = utcnow()
    db.commit()
    db.refresh(folder)

    return schemas.FolderRead(
        id=folder.id,
        name=folder.name,
        parentId=folder.parent_id,
        trashed=folder.trashed,
        originalParentId=folder.original_parent_id,
    )


@app.delete("/drive/folders/{folder_id}", status_code=204)
def delete_folder(
    folder_id: int,
    current_user: CurrentUser,
    db: DBDep,
):
    folder = db.get(models.Folder, folder_id)
    if not folder or folder.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Папка не найдена")
    db.delete(folder)
    db.commit()
    return


# ---------- Files ----------

@app.post("/drive/files/upload", response_model=schemas.FileRead, status_code=201)
async def upload_file(
    current_user: CurrentUser,
    db: DBDep,
    file: UploadFile = FastFile(...),
    folderId: int | None = None,
):
    root = ensure_root_folder(current_user, db)
    folder_id = folderId if folderId is not None else root.id

    folder = db.get(models.Folder, folder_id)
    if not folder or folder.user_id != current_user.id:
        raise HTTPException(status_code=400, detail="Некорректная папка")

    user_dir = UPLOAD_DIR / str(current_user.id)
    user_dir.mkdir(parents=True, exist_ok=True)

    safe_name = file.filename or "file"
    stored_name = f"{current_user.id}_{os.urandom(8).hex()}_{safe_name}"
    path = user_dir / stored_name

    with path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    size_bytes = path.stat().st_size

    db_file = models.File(
        owner_id=current_user.id,
        folder_id=folder.id,
        stored_name=stored_name,
        original_name=safe_name,
        content_type=file.content_type,
        size_bytes=size_bytes,
        starred=False,
        is_shared=False,
        trashed=False,
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)

    from .models import utcnow

    db_file.updated_at = utcnow()
    db.commit()
    db.refresh(db_file)

    return schemas.FileRead(
        id=db_file.id,
        name=db_file.original_name,
        type=_infer_type(db_file.original_name),
        ownerId=db_file.owner_id,
        parentId=db_file.folder_id,
        sizeBytes=db_file.size_bytes,
        starred=db_file.starred,
        isShared=db_file.is_shared,
        trashed=db_file.trashed,
        originalParentId=db_file.original_folder_id,
        modifiedAt=db_file.updated_at,
    )


@app.patch("/drive/files/{file_id}", response_model=schemas.FileRead)
def update_file(
    file_id: int,
    body: schemas.FileUpdate,
    current_user: CurrentUser,
    db: DBDep,
):
    db_file = db.get(models.File, file_id)
    if not db_file or db_file.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Файл не найден")

    if body.starred is not None:
        db_file.starred = body.starred
    if body.isShared is not None:
        db_file.is_shared = body.isShared
    if body.trashed is not None:
        db_file.trashed = body.trashed
    if body.parentId is not None:
        db_file.folder_id = body.parentId
    if body.originalParentId is not None:
        db_file.original_folder_id = body.originalParentId

    from .models import utcnow
    db_file.updated_at = utcnow()
    db.commit()
    db.refresh(db_file)

    return schemas.FileRead(
        id=db_file.id,
        name=db_file.original_name,
        type=_infer_type(db_file.original_name),
        ownerId=db_file.owner_id,
        parentId=db_file.folder_id,
        sizeBytes=db_file.size_bytes,
        starred=db_file.starred,
        isShared=db_file.is_shared,
        trashed=db_file.trashed,
        originalParentId=db_file.original_folder_id,
        modifiedAt=db_file.updated_at,
    )


@app.delete("/drive/files/{file_id}", status_code=204)
def delete_file(
    file_id: int,
    current_user: CurrentUser,
    db: DBDep,
):
    db_file = db.get(models.File, file_id)
    if not db_file or db_file.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Файл не найден")

    file_path = UPLOAD_DIR / str(current_user.id) / db_file.stored_name
    if file_path.exists():
        file_path.unlink()

    db.delete(db_file)
    db.commit()
    return


@app.get("/drive/files/{file_id}/download")
def download_file(
    file_id: int,
    current_user: CurrentUser,
    db: DBDep,
):
    db_file = db.get(models.File, file_id)
    if not db_file:
        raise HTTPException(status_code=404, detail="Файл не найден")

    if not db_file.is_shared and db_file.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет доступа")

    file_path = UPLOAD_DIR / str(db_file.owner_id) / db_file.stored_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Файл не найден на диске")

    return FileResponse(
        file_path,
        media_type=db_file.content_type or "application/octet-stream",
        filename=db_file.original_name,
    )


# ---------- Shared listing ----------

@app.get("/drive/shared", response_model=list[schemas.FileRead])
def get_shared_files(db: DBDep):
    files_db = db.scalars(
        select(models.File)
        .where(models.File.is_shared == True)  # noqa: E712
        .where(models.File.trashed == False)  # noqa: E712
    ).all()
    return [
        schemas.FileRead(
            id=f.id,
            name=f.original_name,
            type=_infer_type(f.original_name),
            ownerId=f.owner_id,
            parentId=f.folder_id,
            sizeBytes=f.size_bytes,
            starred=f.starred,
            isShared=f.is_shared,
            trashed=f.trashed,
            originalParentId=f.original_folder_id,
            modifiedAt=f.updated_at,
        )
        for f in files_db
    ]


def _infer_type(name: str) -> str:
    ext = (name.rsplit(".", 1)[-1] or "").lower()
    if ext in ("doc", "docx"):
        return "doc"
    if ext in ("ppt", "pptx"):
        return "ppt"
    if ext == "pdf":
        return "pdf"
    if ext in ("png", "jpg", "jpeg", "gif", "webp"):
        return "img"
    if ext == "txt":
        return "txt"
    return "file"
