import {z} from "zod"

export const ai_prompt_schema = z.object({
    prompt:z.string().min(10).max(3000)
})