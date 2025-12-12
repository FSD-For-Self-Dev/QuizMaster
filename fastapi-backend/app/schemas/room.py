from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime


class RoomCreate(BaseModel):
    quiz_id: str
    max_players: int = 50


class RoomUpdate(BaseModel):
    status: Optional[str] = None
    max_players: Optional[int] = None


class RoomResponse(BaseModel):
    id: str
    quiz_id: str
    room_code: str
    pin_code: str
    host_user_id: str
    status: str
    max_players: int
    created_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    
    # Include quiz info
    quiz_title: Optional[str] = None
    quiz_description: Optional[str] = None
    quiz_type: Optional[str] = None
    quiz_questions_count: Optional[int] = None
    
    class Config:
        from_attributes = True


class RoomWithParticipants(RoomResponse):
    participants: List['RoomParticipantResponse'] = []


class RoomParticipantBase(BaseModel):
    room_id: str
    user_id: Optional[str] = None
    guest_name: str
    guest_avatar: Optional[str] = None
    is_host: bool = False


class RoomParticipantCreate(RoomParticipantBase):
    pass


class RoomParticipantUpdate(BaseModel):
    is_active: Optional[bool] = None
    left_at: Optional[datetime] = None


class RoomParticipantResponse(BaseModel):
    id: str
    room_id: str
    user_id: Optional[str] = None
    guest_name: str
    guest_avatar: Optional[str] = None
    is_host: bool
    is_active: bool
    joined_at: datetime
    left_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# Update forward references
RoomWithParticipants.model_rebuild()
RoomParticipantResponse.model_rebuild()