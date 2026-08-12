import { z } from "zod";

export const createDataSourceInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Le nom est requis.")
    .max(200, "Le nom ne peut pas dépasser 200 caractères."),
  description: z
    .string()
    .trim()
    .max(2000, "La description ne peut pas dépasser 2000 caractères.")
    .optional(),
});

export type CreateDataSourceInput = z.infer<typeof createDataSourceInputSchema>;

export const updateDataSourceInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Le nom ne peut pas être vide.")
      .max(200, "Le nom ne peut pas dépasser 200 caractères.")
      .optional(),
    description: z
      .string()
      .trim()
      .max(2000, "La description ne peut pas dépasser 2000 caractères.")
      .optional(),
  })
  .refine((data) => data.name !== undefined || data.description !== undefined, {
    message: "Au moins un champ (name ou description) doit être fourni.",
  });

export type UpdateDataSourceInput = z.infer<typeof updateDataSourceInputSchema>;
