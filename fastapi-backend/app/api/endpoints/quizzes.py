from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.schemas.quiz import QuizRead, QuizCreate
from app.schemas.question import Question as QuestionSchema
from app.services.quiz import get_quizzes, create_quiz, get_quiz, delete_quiz
from app.services.question import get_questions_by_quiz

router = APIRouter()


@router.get("/", response_model=List[QuizRead])
def read_quizzes(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """
    Retrieve all quizzes.
    """
    quiz_data = get_quizzes(db, skip=skip, limit=limit)
    
    # Convert tuples to dictionaries that Pydantic can parse
    result = []
    for quiz, questions_count in quiz_data:
        quiz_dict = {
            "id": quiz.id,
            "title": quiz.title,
            "description": quiz.description,
            "type": quiz.type,
            "settings": quiz.settings,
            "created_at": quiz.created_at,
            "updated_at": quiz.updated_at,
            "questions_count": questions_count  # ← now included
        }
        result.append(quiz_dict)
    
    return result


@router.post("/", response_model=QuizRead, status_code=status.HTTP_201_CREATED)
def create_new_quiz(quiz: QuizCreate, db: Session = Depends(get_db)):
    """
    Create a new quiz.
    """
    # Create the quiz (assumes you have a create_quiz function)
    quiz = create_quiz(db, quiz)
    
    # Manually set questions_count
    quiz.questions_count = len(quiz.questions) if quiz.questions else 0

    return quiz


@router.get("/{quiz_id}", response_model=QuizRead)
def read_quiz(quiz_id: str, db: Session = Depends(get_db)):
    """
    Get a specific quiz by ID.
    """
    db_quiz = get_quiz(db, quiz_id=quiz_id)
    if db_quiz is None:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return db_quiz


@router.get("/{quiz_id}/questions", response_model=List[QuestionSchema])
def read_quiz_questions(quiz_id: str, db: Session = Depends(get_db)):
    """
    Get all questions for a specific quiz.
    """
    print('???')
    # Ensure quiz exists (optional but nicer errors)
    db_quiz = get_quiz(db, quiz_id=quiz_id)
    if db_quiz is None:
        raise HTTPException(status_code=404, detail="Quiz not found")

    questions = get_questions_by_quiz(db, quiz_id=quiz_id)
    return questions


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
