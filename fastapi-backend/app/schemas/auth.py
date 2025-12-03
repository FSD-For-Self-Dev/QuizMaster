from typing import Optional
from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
    email: EmailStr
    username: str


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    """
    Login payload coming from the frontend.
    The frontend sends a single identifier field called `username`
    which may contain either the actual username or the email.
    The backend then matches against both.
    """
    username: str
    password: str


class User(UserBase):
    id: str
    provider: Optional[str] = "local"
    provider_id: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    username: Optional[str] = None
