from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.schemas.answer import Answer, AnswerCreate
from app.services.answer import create_answer as create_answer_service

router = APIRouter()


@router.post("/", response_model=Answer)
def create_answer(answer: AnswerCreate, db: Session = Depends(get_db)):
    """
    Create a new answer.
    """
    return create_answer_service(db=db, answer=answer)
