from sqlalchemy import Column, String, DateTime, Boolean
from sqlalchemy.sql import func

from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=True)  # Optional for OAuth users
    provider = Column(String, default="local")  # 'local' or 'google'
    provider_id = Column(String, nullable=True)  # OAuth provider user ID
    avatar_url = Column(String, nullable=True)  # Profile picture from OAuth provider
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
