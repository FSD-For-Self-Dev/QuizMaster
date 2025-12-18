from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import json


class QuizRoundItemBase(BaseModel):
    quiz_id: str
    order_index: int


class QuizRoundItemCreate(QuizRoundItemBase):
    pass


class QuizRoundItemRead(QuizRoundItemBase):
    id: str
    quiz_round_id: str
    created_at: datetime

    # Include quiz details
    quiz_title: str
    quiz_type: str
    quiz_description: Optional[str] = None

    model_config = {
        "from_attributes": True,
    }


class QuizRoundBase(BaseModel):
    title: str
    description: Optional[str] = None


class QuizRoundCreate(QuizRoundBase):
    round_items: List[QuizRoundItemCreate]


class QuizRoundRead(QuizRoundBase):
    id: str
    created_at: datetime
    updated_at: datetime
    round_items: List[QuizRoundItemRead]

    model_config = {
        "from_attributes": True,
    }

