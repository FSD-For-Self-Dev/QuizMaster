from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.schemas.quiz import QuizRead, QuizCreate
from app.services.quiz import get_quizzes, create_quiz, get_quiz, delete_quiz

router = APIRouter()


@router.get("/", response_model=List[QuizRead])
def read_quizzes(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """
    Retrieve all quizzes.
    """
    quizzes = get_quizzes(db, skip=skip, limit=limit)
    return quizzes


@router.post("/", response_model=QuizRead, status_code=status.HTTP_201_CREATED)
def create_new_quiz(quiz: QuizCreate, db: Session = Depends(get_db)):
    """
    Create a new quiz.
    """
    return create_quiz(db=db, quiz=quiz)


@router.get("/{quiz_id}", response_model=QuizRead)
def read_quiz(quiz_id: str, db: Session = Depends(get_db)):
    """
    Get a specific quiz by ID.
    """
    db_quiz = get_quiz(db, quiz_id=quiz_id)
    if db_quiz is None:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return db_quiz


@router.delete("/{quiz_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_quiz_endpoint(quiz_id: str, db: Session = Depends(get_db)):
    """
    Delete a quiz by ID. Also deletes related questions & answers via
    database cascade constraints.
    """
    deleted = delete_quiz(db, quiz_id=quiz_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Quiz not found")
    # 204 No Content – nothing to return
    return None
