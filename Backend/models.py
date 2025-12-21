from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.sql import func
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Folder(Base):
    __tablename__ = "folders"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    owner_id = Column(Integer, ForeignKey("users.id"))
    parent_id = Column(Integer, ForeignKey("folders.id"), nullable=True)
    trashed = Column(Boolean, default=False)
    original_parent_id = Column(Integer, nullable=True)

class File(Base):
    __tablename__ = "files"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    type = Column(String) 
    owner_id = Column(Integer, ForeignKey("users.id"))
    parent_id = Column(Integer, ForeignKey("folders.id"), nullable=True)
    size_bytes = Column(Integer)
    starred = Column(Boolean, default=False)
    is_shared = Column(Boolean, default=False) 
    trashed = Column(Boolean, default=False)
    original_parent_id = Column(Integer, nullable=True)
    modified_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    storage_path = Column(String)