import shutil
import os
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File as UploadFileParam, Form
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from jose import JWTError, jwt

import models, schemas, auth
from database import engine, get_db

models.Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.email == username).first()
    if user is None:
        raise credentials_exception
    return user


@app.post("/auth/register", response_model=schemas.UserOut)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_pw = auth.get_password_hash(user.password)
    new_user = models.User(email=user.email, hashed_password=hashed_pw)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    root_folder = models.Folder(name="Root", owner_id=new_user.id, parent_id=None)
    db.add(root_folder)
    db.commit()

    return new_user

@app.post("/auth/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")

    access_token = auth.create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/auth/me", response_model=schemas.UserOut)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user


@app.get("/drive/state", response_model=schemas.DriveState)
def get_drive_state(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    root_folder = db.query(models.Folder).filter(
        models.Folder.owner_id == current_user.id,
        models.Folder.parent_id == None
    ).first()

    folders = db.query(models.Folder).filter(models.Folder.owner_id == current_user.id).all()
    files = db.query(models.File).filter(models.File.owner_id == current_user.id).all()

    folders_out = [
        schemas.FolderOut(
            id=f.id, name=f.name, parentId=f.parent_id,
            trashed=f.trashed, originalParentId=f.original_parent_id
        ) for f in folders
    ]
    files_out = [
        schemas.FileOut(
            id=f.id, name=f.name, type=f.type, ownerId=f.owner_id,
            parentId=f.parent_id, sizeBytes=f.size_bytes, starred=f.starred,
            isShared=f.is_shared, trashed=f.trashed,
            originalParentId=f.original_parent_id, modifiedAt=f.modified_at
        ) for f in files
    ]

    return {
        "rootFolderId": root_folder.id if root_folder else 0, # Защита, если рут вдруг не создался
        "folders": folders_out,
        "files": files_out
    }

@app.post("/drive/folders", response_model=schemas.FolderOut)
def create_folder(folder_in: schemas.FolderCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    new_folder = models.Folder(
        name=folder_in.name,
        owner_id=current_user.id,
        parent_id=folder_in.parentId
    )
    db.add(new_folder)
    db.commit()
    db.refresh(new_folder)
    return schemas.FolderOut(
        id=new_folder.id, name=new_folder.name, parentId=new_folder.parent_id,
        trashed=new_folder.trashed, originalParentId=new_folder.original_parent_id
    )

@app.post("/drive/files/upload", response_model=schemas.FileOut)
def upload_file(
    file: UploadFile = UploadFileParam(...),
    folderId: Optional[str] = Form(None), # FormData приходит как строка
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    file_location = f"{UPLOAD_DIR}/{current_user.id}_{file.filename}"
    with open(file_location, "wb+") as file_object:
        shutil.copyfileobj(file.file, file_object)

    pid = int(folderId) if folderId and folderId != "null" else None

    db_file = models.File(
        name=file.filename,
        type=file.content_type,
        owner_id=current_user.id,
        parent_id=pid,
        size_bytes=os.path.getsize(file_location),
        storage_path=file_location
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)

    return schemas.FileOut(
        id=db_file.id, name=db_file.name, type=db_file.type, ownerId=db_file.owner_id,
        parentId=db_file.parent_id, sizeBytes=db_file.size_bytes, starred=db_file.starred,
        isShared=db_file.is_shared, trashed=db_file.trashed,
        originalParentId=db_file.original_parent_id, modifiedAt=db_file.modified_at
    )

@app.patch("/drive/files/{file_id}", response_model=schemas.FileOut)
def update_file(file_id: int, patch: schemas.FileUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_file = db.query(models.File).filter(models.File.id == file_id, models.File.owner_id == current_user.id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    if patch.starred is not None: db_file.starred = patch.starred
    if patch.isShared is not None: db_file.is_shared = patch.isShared
    if patch.trashed is not None: db_file.trashed = patch.trashed
    if patch.parentId is not None: db_file.parent_id = patch.parentId

    if patch.originalParentId is not None: db_file.original_parent_id = patch.originalParentId

    db.commit()
    db.refresh(db_file)

    return schemas.FileOut(
        id=db_file.id, name=db_file.name, type=db_file.type, ownerId=db_file.owner_id,
        parentId=db_file.parent_id, sizeBytes=db_file.size_bytes, starred=db_file.starred,
        isShared=db_file.is_shared, trashed=db_file.trashed,
        originalParentId=db_file.original_parent_id, modifiedAt=db_file.modified_at
    )

@app.patch("/drive/folders/{folder_id}", response_model=schemas.FolderOut)
def update_folder(folder_id: int, patch: schemas.FolderUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_folder = db.query(models.Folder).filter(models.Folder.id == folder_id, models.Folder.owner_id == current_user.id).first()
    if not db_folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    if patch.trashed is not None: db_folder.trashed = patch.trashed
    if patch.parentId is not None: db_folder.parent_id = patch.parentId
    if patch.originalParentId is not None: db_folder.original_parent_id = patch.originalParentId

    db.commit()
    db.refresh(db_folder)

    return schemas.FolderOut(
        id=db_folder.id, name=db_folder.name, parentId=db_folder.parent_id,
        trashed=db_folder.trashed, originalParentId=db_folder.original_parent_id
    )

@app.delete("/drive/files/{file_id}")
def delete_file(file_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_file = db.query(models.File).filter(models.File.id == file_id, models.File.owner_id == current_user.id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    if os.path.exists(db_file.storage_path):
        os.remove(db_file.storage_path)

    db.delete(db_file)
    db.commit()
    return {"status": "ok"}

@app.get("/drive/files/{file_id}/download")
def download_file(file_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_file = db.query(models.File).filter(models.File.id == file_id, models.File.owner_id == current_user.id).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(db_file.storage_path, filename=db_file.name)