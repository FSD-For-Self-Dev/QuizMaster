from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.quiz_round import (
    create_quiz_round,
    get_quiz_rounds,
    get_quiz_round,
    delete_quiz_round,
    get_available_quizzes_for_round,
)
from app.schemas.quiz_round import QuizRoundCreate, QuizRoundRead
from app.schemas.quiz import QuizAvailable

router = APIRouter()


@router.get("/available-quizzes", response_model=List[QuizAvailable])
async def get_available_quizzes_endpoint(db: Session = Depends(get_db)):
    """Get all available quizzes that can be used in quiz rounds."""
    return get_available_quizzes_for_round(db)


@router.get("/", response_model=List[QuizRoundRead])
async def get_quiz_rounds_endpoint(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """Get all quiz rounds."""
    return get_quiz_rounds(db, skip=skip, limit=limit)


@router.post("/", response_model=QuizRoundRead)
async def create_quiz_round_endpoint(
    quiz_round: QuizRoundCreate,
    db: Session = Depends(get_db),
):
    """Create a new quiz round."""
    try:
        return create_quiz_round(db, quiz_round)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{quiz_round_id}", response_model=QuizRoundRead)
async def get_quiz_round_endpoint(
    quiz_round_id: str,
    db: Session = Depends(get_db),
):
    """Get a specific quiz round by ID."""
    quiz_round = get_quiz_round(db, quiz_round_id)
    if not quiz_round:
        raise HTTPException(status_code=404, detail="Quiz round not found")
    return quiz_round


@router.delete("/{quiz_round_id}")
async def delete_quiz_round_endpoint(
    quiz_round_id: str,
    db: Session = Depends(get_db),
):
    """Delete a quiz round."""
    success = delete_quiz_round(db, quiz_round_id)
    if not success:
        raise HTTPException(status_code=404, detail="Quiz round not found")
    return {"message": "Quiz round deleted successfully"}