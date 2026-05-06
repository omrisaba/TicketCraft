import { useState, type FormEvent } from 'react';
import type { GuidingQuestion } from 'ticketcraft-shared';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { MessageCircleQuestion, Send } from 'lucide-react';

interface GuidingQuestionsProps {
  questions: GuidingQuestion[];
  onSubmitAnswers: (answers: Record<string, string>) => void;
  loading?: boolean;
  /** When true, submit is disabled (e.g. custom skills over server limit). */
  improveBlocked?: boolean;
}

export function GuidingQuestions({ questions, onSubmitAnswers, loading, improveBlocked }: GuidingQuestionsProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const groupedByDimension = questions.reduce<Record<string, GuidingQuestion[]>>((acc, q) => {
    if (!acc[q.dimension]) acc[q.dimension] = [];
    acc[q.dimension].push(q);
    return acc;
  }, {});

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const filledAnswers: Record<string, string> = {};
    for (const q of questions) {
      if (answers[q.id]?.trim()) {
        filledAnswers[q.question] = answers[q.id].trim();
      }
    }
    onSubmitAnswers(filledAnswers);
  };

  const answeredCount = Object.values(answers).filter((v) => v.trim()).length;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <MessageCircleQuestion className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-semibold text-gray-800">Guiding Questions</h3>
        <Badge variant="info">{answeredCount}/{questions.length} answered</Badge>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Answer these questions to help improve the weak areas of your ticket.
        Short, informal answers are fine — the AI will weave them into a proper format.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {Object.entries(groupedByDimension).map(([dimension, dimQuestions]) => (
          <div key={dimension} className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              {dimension}
            </h4>
            {dimQuestions.map((q) => (
              <div key={q.id} className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">
                  {q.question}
                </label>
                {q.hints && (
                  <p className="text-xs text-gray-400 italic">{q.hints}</p>
                )}
                <textarea
                  value={answers[q.id] || ''}
                  onChange={(e) =>
                    setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                  }
                  placeholder="Your answer..."
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-gray-400 resize-y"
                />
              </div>
            ))}
          </div>
        ))}

        <div className="flex justify-end">
          <Button
            type="submit"
            icon={<Send className="w-4 h-4" />}
            loading={loading}
            disabled={answeredCount === 0 || improveBlocked}
          >
            Submit Answers & Re-generate
          </Button>
        </div>
      </form>
    </Card>
  );
}
