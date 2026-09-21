import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const analyzeDelayWithGroq = async (delayContext) => {
  const prompt = `
You are an AI productivity assistant for a task management application.

Analyze why the task is delayed using ONLY the provided task data.

Consider:

1. Parent task deadline
2. Parent task status
3. Subtask completion
4. Overdue subtasks
5. Subtask assignments
6. Task participants
7. Recent activity
8. Task progress

Do NOT invent facts.

If the available data does not provide enough evidence
for a particular reason, do not claim it.

Return ONLY valid JSON using this structure:

{
  "delayed": true,
  "reasons": [
    {
      "type": "OVERDUE_SUBTASK",
      "description": "..."
    }
  ],
  "affectedSubtasks": [
    {
      "id": "...",
      "title": "..."
    }
  ],
  "summary": "..."
}

Task data:

${JSON.stringify(delayContext, null, 2)}
`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",

    messages: [
      {
        role: "system",
        content: "You analyze task delays based only on supplied data.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],

    temperature: 0.2,

    response_format: {
      type: "json_object",
    },
  });

  const content = completion.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Groq returned an empty response");
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error("Groq returned invalid JSON");
  }
};

export { analyzeDelayWithGroq };
