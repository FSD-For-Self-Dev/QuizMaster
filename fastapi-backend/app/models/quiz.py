from sqlalchemy import Column, String, Text, DateTime, Integer
from sqlalchemy.sql import func

from app.models.base import Base


class Quiz(Base):
    __tablename__ = "quizzes"

    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    type = Column(String, nullable=False)  # 'classic' or 'jeopardy'
    settings = Column(Text, nullable=True)  # JSON string for quiz settings
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
