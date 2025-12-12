from sqlalchemy import Column, String, Text, DateTime, Boolean, Integer, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base


class Room(Base):
    __tablename__ = "rooms"

    id = Column(String, primary_key=True, index=True)
    quiz_id = Column(String, ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False)
    room_code = Column(String, unique=True, nullable=False, index=True)  # 8-character code for sharing
    pin_code = Column(String, nullable=False)  # 4-digit PIN for joining
    host_user_id = Column(String, nullable=False)  # User ID of the host
    status = Column(String, default="waiting")  # 'waiting', 'started', 'finished'
    max_players = Column(Integer, default=50)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    quiz = relationship("Quiz", back_populates="rooms")
    participants = relationship("RoomParticipant", back_populates="room", cascade="all, delete-orphan", passive_deletes=True)