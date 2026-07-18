import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

class GroqProvider {
  async generate({
    prompt,
    model = "llama-3.3-70b-versatile",
    temperature = 0.3,
    maxOutputTokens = 600,
  }) {
    try {
      const response = await groq.chat.completions.create({
        model,
        temperature,
        max_tokens: maxOutputTokens,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const text = response.choices[0].message.content.trim();

      // Remove markdown code fences if the model returns them
      const cleanText = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      return JSON.parse(cleanText);
    } catch (error) {
      console.error(error);
      throw new Error("AI_PROVIDER_ERROR");
    }
  }
}

export default new GroqProvider();
