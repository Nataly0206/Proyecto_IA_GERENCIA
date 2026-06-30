import { Request, Response } from 'express';
import { runAiChat, ConversationMessage } from '../services/ai.service';
import { ApiError } from '../middleware/errorHandler';

interface ChatRequestBody {
  messages?: unknown[];
}

export async function chat(req: Request, res: Response): Promise<void> {
  const body = req.body as ChatRequestBody;

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new ApiError(400, 'El campo "messages" debe ser un array no vacío.');
  }

  const messages: ConversationMessage[] = body.messages.map((m, i) => {
    const msg = m as Record<string, unknown>;
    if (msg.role !== 'user' && msg.role !== 'assistant') {
      throw new ApiError(400, `messages[${i}].role debe ser "user" o "assistant".`);
    }
    if (typeof msg.content !== 'string') {
      throw new ApiError(400, `messages[${i}].content debe ser un string.`);
    }
    return { role: msg.role, content: msg.content };
  });

  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role !== 'user') {
    throw new ApiError(400, 'El último mensaje debe ser del rol "user".');
  }

  const result = await runAiChat(messages);
  res.json(result);
}
