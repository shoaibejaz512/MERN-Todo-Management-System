import {z} from "zod"

export const single_todo_schema = z.object({
    //title validation
    title:z.string().min(6).max(30),
    description:z.string().min(20),
})
