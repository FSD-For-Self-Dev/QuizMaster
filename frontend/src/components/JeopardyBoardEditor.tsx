import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Question } from './QuizEditor';
import { JeopardyCategoryEditor } from './JeopardyCategoryEditor';
import './JeopardyBoardEditor.css';

interface JeopardyBoardEditorProps {
  questions: Question[];
  onQuestionsChange: (questions: Question[]) => void;
}

export const JeopardyBoardEditor: React.FC<JeopardyBoardEditorProps> = ({
  questions,
  onQuestionsChange
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Group questions by category
  const categories = React.useMemo(() => {
    const categoryMap = new Map<string, Question[]>();
    questions.forEach(question => {
      const category = question.category || 'Uncategorized';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)!.push(question);
    });
    return categoryMap;
  }, [questions]);

  const addCategory = () => {
    const categoryName = prompt('Enter category name:');
    if (categoryName && !categories.has(categoryName)) {
      // Add a placeholder question to create the category
      const newQuestion: Question = {
        id: Date.now().toString(),
        question: '',
        type: 'jeopardy',
        category: categoryName,
        points: 100,
        order_index: questions.length,
        answers: [{
          answer: '',
          is_correct: true,
          order_index: 0
        }]
      };
      onQuestionsChange([...questions, newQuestion]);
    }
  };

  const updateCategoryName = (oldName: string, newName: string) => {
    if (oldName !== newName && !categories.has(newName)) {
      const updatedQuestions = questions.map(q =>
        q.category === oldName ? { ...q, category: newName } : q
      );
      onQuestionsChange(updatedQuestions);
    }
  };

  const deleteCategory = (categoryName: string) => {
    if (confirm(`Are you sure you want to delete the "${categoryName}" category and all its questions?`)) {
      onQuestionsChange(questions.filter(q => q.category !== categoryName));
    }
  };

  const updateQuestions = (categoryName: string, newQuestions: Question[]) => {
    const otherQuestions = questions.filter(q => q.category !== categoryName);
    onQuestionsChange([...otherQuestions, ...newQuestions]);
  };

  // Generate Jeopardy board layout (typically 6 categories × 5 questions)
  const renderBoard = () => {
    const categoryNames = Array.from(categories.keys());
    const pointValues = [100, 200, 300, 400, 500];

    return (
      <div className="jeopardy-board">
        <div className="board-categories">
          {categoryNames.slice(0, 6).map((categoryName, index) => (
            <motion.div
              key={categoryName}
              className="board-category"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => setSelectedCategory(categoryName)}
            >
              <div className="category-title">{categoryName}</div>
            </motion.div>
          ))}
          {categoryNames.length < 6 && (
            <motion.div
              className="board-category add-category"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.05 }}
              onClick={addCategory}
            >
              <div className="add-category-icon">+</div>
              <div className="add-category-text">Add Category</div>
            </motion.div>
          )}
        </div>

        <div className="board-questions">
          {pointValues.map((points, rowIndex) => (
            <div key={points} className="board-row">
              {categoryNames.slice(0, 6).map((categoryName, colIndex) => {
                const categoryQuestions = categories.get(categoryName) || [];
                const question = categoryQuestions.find(q => q.points === points);

                return (
                  <motion.div
                    key={`${categoryName}-${points}`}
                    className={`board-cell ${question ? 'filled' : 'empty'}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: (rowIndex + colIndex) * 0.05 }}
                    onClick={() => question && setSelectedCategory(categoryName)}
                  >
                    {question ? (
                      <div className="cell-content">
                        <span className="points-value">${points}</span>
                      </div>
                    ) : (
                      <div className="cell-content empty">
                        <span className="empty-indicator">Empty</span>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="jeopardy-board-editor">
      <div className="editor-section-header">
        <h2>Jeopardy Board</h2>
        <div className="board-stats">
          <span>{categories.size} Categories</span>
          <span>{questions.length} Questions</span>
        </div>
      </div>

      {renderBoard()}

      <AnimatePresence>
        {selectedCategory && (
          <JeopardyCategoryEditor
            key={selectedCategory}
            categoryName={selectedCategory}
            questions={categories.get(selectedCategory) || []}
            onUpdate={(newQuestions) => updateQuestions(selectedCategory, newQuestions)}
            onRename={(newName) => updateCategoryName(selectedCategory, newName)}
            onDelete={() => deleteCategory(selectedCategory)}
            onClose={() => setSelectedCategory(null)}
          />
        )}
      </AnimatePresence>

      <div className="board-instructions">
        <h3>How to Build Your Jeopardy Board:</h3>
        <ol>
          <li>Click "Add Category" to create up to 6 categories</li>
          <li>Click on any category title to edit questions and answers</li>
          <li>Each category should have 5 questions with increasing point values (100, 200, 300, 400, 500)</li>
          <li>Questions should be written as answers, with the question being the clue</li>
        </ol>
      </div>
    </div>
  );
};
