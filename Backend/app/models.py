from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import relationship

from .database import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    folders = relationship("Folder", back_populates="user", cascade="all,delete-orphan")
    files = relationship("File", back_populates="owner", cascade="all,delete-orphan")


class Folder(Base):
    __tablename__ = "folders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    parent_id = Column(
        Integer,
        ForeignKey("folders.id", ondelete="CASCADE"),
        nullable=True,
    )
    trashed = Column(Boolean, nullable=False, default=False)
    original_parent_id = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="folders")
    files = relationship("File", back_populates="folder")


class File(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    folder_id = Column(
        Integer,
        ForeignKey("folders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    stored_name = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=False)
    content_type = Column(String(100), nullable=True)
    size_bytes = Column(BigInteger, nullable=False, default=0)

    starred = Column(Boolean, nullable=False, default=False)
    is_shared = Column(Boolean, nullable=False, default=False)
    trashed = Column(Boolean, nullable=False, default=False)
    original_folder_id = Column(Integer, nullable=True)

    uploaded_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    owner = relationship("User", back_populates="files")
    folder = relationship("Folder", back_populates="files")
