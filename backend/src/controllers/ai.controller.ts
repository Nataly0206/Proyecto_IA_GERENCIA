import { Request, Response } from 'express';
import { runAiChat, ConversationMessage } from '../services/ai.service';
import { ApiError } from '../middleware/errorHandler';

interface ChatRequestBody {
  messages?: unknown[];
}

const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_CONVERSATION_CHARS = 16_000;

export async function chat(req: Request, res: Response): Promise<void> {
  const body = req.body as ChatRequestBody;

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new ApiError(400, 'El campo "messages" debe ser un array no vacío.');
  }
  if (body.messages.length > MAX_MESSAGES) {
    throw new ApiError(400, `La conversación no puede superar ${MAX_MESSAGES} mensajes.`);
  }

  let conversationChars = 0;
  const messages: ConversationMessage[] = body.messages.map((m, i) => {
    if (!m || typeof m !== 'object' || Array.isArray(m)) {
      throw new ApiError(400, `messages[${i}] debe ser un objeto.`);
    }
    const msg = m as Record<string, unknown>;
    if (msg.role !== 'user' && msg.role !== 'assistant') {
      throw new ApiError(400, `messages[${i}].role debe ser "user" o "assistant".`);
    }
    if (typeof msg.content !== 'string') {
      throw new ApiError(400, `messages[${i}].content debe ser un string.`);
    }
    const content = msg.content.trim();
    if (!content || content.length > MAX_MESSAGE_CHARS) {
      throw new ApiError(
        400,
        `messages[${i}].content debe tener entre 1 y ${MAX_MESSAGE_CHARS} caracteres.`,
      );
    }
    conversationChars += content.length;
    if (conversationChars > MAX_CONVERSATION_CHARS) {
      throw new ApiError(
        400,
        `La conversación no puede superar ${MAX_CONVERSATION_CHARS} caracteres.`,
      );
    }
    return { role: msg.role, content };
  });

  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role !== 'user') {
    throw new ApiError(400, 'El último mensaje debe ser del rol "user".');
  }

  const result = await runAiChat(messages);
  res.json(result);
}
