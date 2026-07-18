// ai/services/todoAI.service.js
import geminiProvider from "../providers/geminiProvider.js";
import { singleTodoPrompt } from "../prompts/singleTodo.prompt.js";

class TodoAIService {
  async generateSingleTodo(userPrompt) {
    const prompt = singleTodoPrompt(userPrompt);

    const todo = await geminiProvider.generate({
      prompt,
    });

    return todo;
  }
}

export default new TodoAIService();
