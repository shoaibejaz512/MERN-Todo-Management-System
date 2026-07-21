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

  async generateGroupTodo(userPrompt) {
    const prompt = groupTodoPrompt(userPrompt);

    return await geminiProvider.generate({
      prompt,
    });
  }
}

export default new TodoAIService();
