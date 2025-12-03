from pydantic import BaseModel, field_validator
from typing import Optional, Dict, Any, Any
from datetime import datetime
import json


class QuizSettings(BaseModel):
    timeLimit: Optional[int] = None  # seconds per question
    randomizeQuestions: Optional[bool] = None
    showCorrectAnswers: Optional[bool] = None
    theme: Optional[str] = None


class QuizBase(BaseModel):
    title: str
    description: Optional[str] = None
    type: str  # 'classic' or 'jeopardy'
    settings: Optional[QuizSettings] = None
    questions_count: int


class QuizCreate(QuizBase):
    pass


class QuizRead(QuizBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }

    @field_validator("settings", mode="before")
    @classmethod
    def parse_settings(cls, v: Any) -> Any:
        """
        Allow settings to be stored as a JSON string in the database,
        but exposed as a QuizSettings object in the API.
        """
        if isinstance(v, str):
            try:
                data = json.loads(v)
                return QuizSettings(**data)
            except Exception:
                # If parsing fails, just ignore and return None
                return None
        return v
