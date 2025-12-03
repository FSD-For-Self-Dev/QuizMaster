from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class QuestionBase(BaseModel):
    quiz_id: str
    category: Optional[str] = None  # For jeopardy
    question: str
    type: str  # 'multiple_choice', 'true_false', 'short_answer', 'jeopardy'
    points: Optional[int] = None  # For jeopardy
    order_index: int
    media_url: Optional[str] = None
    media_type: Optional[str] = None  # 'image', 'audio', 'video'


class QuestionCreate(QuestionBase):
    pass


class Question(QuestionBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True
