import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(3).max(30),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8).max(30),
  bio: z.string().min(5),
});
