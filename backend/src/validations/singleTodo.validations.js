import { z } from "zod";

export const single_todo_schema = z.object({
  title: z
    .string()
    .trim()
    .min(6, "Title must be at least 6 characters")
    .max(30, "Title cannot exceed 30 characters"),

  description: z
    .string()
    .trim()
    .min(20, "Description must be at least 20 characters"),

  priority: z.enum(["low", "medium", "high"]).default("medium").optional(),

  estimatedHours: z
    .number()
    .min(0, "Estimated hours cannot be negative")
    .optional(),

  deadline: z.string().datetime("Deadline must be a valid ISO date"),

  tags: z.array(z.string().trim()).optional().default([]),

  source: z.enum(["manual", "ai"]).optional().default("manual"),

  status: z
    .enum(["START", "COMPLETED", "PENDING", "ON_GOING", "IN_COMPLETE"])
    .optional(),
});
