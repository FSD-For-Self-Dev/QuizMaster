from pydantic import BaseModel
from typing import Optional


class AnswerBase(BaseModel):
    question_id: str
    answer: str
    is_correct: bool
    order_index: int
    media_url: Optional[str] = None
    media_type: Optional[str] = None  # 'image'


class AnswerCreate(AnswerBase):
    pass


class Answer(AnswerBase):
    id: str

    class Config:
        from_attributes = True
