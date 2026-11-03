import { z } from "zod";
import { problemDetailsSchema } from "@roku-manager/core";

export const noEntityErrorSchema = z.object({
  code: z.literal("ENOENT"),
});

export const apiProblemContent = {
  "application/problem+json": {
    schema: problemDetailsSchema,
  },
} as const;
