import { useState, useRef, useEffect, type FormEvent } from 'react';
import { api } from '../../services/apiClient';
import { Button } from '../ui/Button';
import type { Ticket, TicketChanges, RefinementMessage, RefineResponse } from 'ticketcraft-shared';
import { Send, MessageSquare, Loader2, Bot, User } from 'lucide-react';

interface RefinementChatProps {
  ticket: Ticket;
  improvements: TicketChanges;
  repoContextPrompt?: string;
  referenceContent?: string;
  onUpdate: (updated: TicketChanges) => void;
}

export function RefinementChat({ ticket, improvements, repoContextPrompt, referenceContent, onUpdate }: RefinementChatProps) {
  const [messages, setMessages] = useState<RefinementMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const instruction = input.trim();
    if (!instruction || loading) return;

    const userMsg: RefinementMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: instruction,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const result = await api.ai.refine({
        ticket,
        currentImprovements: improvements,
        instruction,
        conversationHistory: [...messages, userMsg],
        repoContextPrompt,
        referenceContent,
      }) as RefineResponse;

      const assistantMsg: RefinementMessage = {
        id: `msg_${Date.now()}_reply`,
        role: 'assistant',
        content: result.explanation,
        timestamp: new Date().toISOString(),
        appliedChanges: result.updatedTicket,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      onUpdate(result.updatedTicket);
    } catch (err: any) {
      const errorMsg: RefinementMessage = {
        id: `msg_${Date.now()}_err`,
        role: 'assistant',
        content: `Failed to apply refinement: ${err.message || 'Unknown error'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as unknown as FormEvent);
    }
  };

  const suggestions = [
    'Make the description more technical',
    'Add error handling edge cases to AC',
    'Simplify the summary',
    'Add security considerations',
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50/50">
        <MessageSquare className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-gray-800">Refine with AI</h3>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-center py-6 space-y-4">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 text-blue-600">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Refine iteratively</p>
              <p className="text-xs text-gray-400 mt-1 max-w-[220px] mx-auto">
                Tell me what to change and I'll update the ticket. Try:
              </p>
            </div>
            <div className="space-y-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setInput(s)}
                  className="block w-full text-left text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-3 py-1.5 transition-colors cursor-pointer"
                >
                  "{s}"
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-blue-600" />
              </div>
            )}
            <div
              className={`rounded-lg px-3 py-2 text-sm max-w-[85%] ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.appliedChanges && (
                <p className="text-xs mt-1.5 opacity-70 border-t border-current/10 pt-1">
                  Changes applied to ticket
                </p>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5 text-gray-600" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2 items-start">
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="bg-gray-100 rounded-lg px-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="border-t border-gray-200 p-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell me what to change..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-gray-400"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!input.trim() || loading}
            icon={<Send className="w-3.5 h-3.5" />}
            aria-label="Send message"
          />
        </div>
      </form>
    </div>
  );
}
