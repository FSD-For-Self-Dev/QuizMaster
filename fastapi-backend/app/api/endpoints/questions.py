from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.schemas.question import Question, QuestionCreate
from app.services.question import create_question as create_question_service
from app.services.answer import get_answers_by_question

router = APIRouter()


@router.post("/", response_model=Question)
def create_question(question: QuestionCreate, db: Session = Depends(get_db)):
    """
    Create a new question.
    """
    return create_question_service(db=db, question=question)


@router.get("/{question_id}/answers")
def get_question_answers(question_id: str, db: Session = Depends(get_db)):
    """
    Get all answers for a specific question.
    """
    answers = get_answers_by_question(db, question_id=question_id)
    return answers
