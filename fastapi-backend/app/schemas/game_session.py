from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class GameAnswer(BaseModel):
    question_id: str
    answer_id: str
    is_correct: bool
    time_taken: Optional[int] = None  # seconds


class GameSessionBase(BaseModel):
    quiz_id: str
    player_name: str
    score: int = 0
    answers: List[GameAnswer]


class GameSessionCreate(GameSessionBase):
    pass


class GameSession(GameSessionBase):
    id: str
    started_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
