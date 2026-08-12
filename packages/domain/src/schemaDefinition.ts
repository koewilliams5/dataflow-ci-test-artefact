import { z } from "zod";

/**
 * Format JSON du schéma attendu d'une source (stocké dans SchemaVersion.definition,
 * en JSONB — voir packages/database). Postgres est schemaless sur cette colonne ;
 * ce module Zod EST le contrat réel : toute écriture est parsée ici avant d'être
 * persistée, toute lecture peut être considérée fiable sans re-vérification.
 *
 * Documentation complète du format : voir DESIGN.md, section "Format du schéma".
 */

export const columnTypeSchema = z.enum([
  "string",
  "integer",
  "number",
  "boolean",
  "date",
  "datetime",
]);
export type ColumnType = z.infer<typeof columnTypeSchema>;

const baseColumnFields = {
  name: z
    .string()
    .min(1, "Le nom de colonne ne peut pas être vide.")
    .max(200, "Le nom de colonne ne peut pas dépasser 200 caractères."),
  required: z.boolean().default(false),
  unique: z.boolean().default(false),
};

const stringColumnSchema = z.object({
  ...baseColumnFields,
  type: z.literal("string"),
  allowedValues: z
    .array(z.string(), { message: "allowedValues doit être un tableau de chaînes." })
    .min(1, "allowedValues ne peut pas être vide s'il est fourni.")
    .optional(),
  pattern: z.string().min(1, "pattern ne peut pas être une chaîne vide.").optional(),
  minLength: z.number().int().min(0, "minLength doit être un entier positif ou nul.").optional(),
  maxLength: z.number().int().min(0, "maxLength doit être un entier positif ou nul.").optional(),
});

const integerColumnSchema = z.object({
  ...baseColumnFields,
  type: z.literal("integer"),
  allowedValues: z
    .array(z.number().int(), { message: "allowedValues doit être un tableau d'entiers." })
    .min(1, "allowedValues ne peut pas être vide s'il est fourni.")
    .optional(),
  min: z.number().int().optional(),
  max: z.number().int().optional(),
  positive: z.boolean().optional(),
});

const numberColumnSchema = z.object({
  ...baseColumnFields,
  type: z.literal("number"),
  allowedValues: z
    .array(z.number(), { message: "allowedValues doit être un tableau de nombres." })
    .min(1, "allowedValues ne peut pas être vide s'il est fourni.")
    .optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  positive: z.boolean().optional(),
});

const booleanColumnSchema = z.object({
  ...baseColumnFields,
  type: z.literal("boolean"),
});

// dateFormat est obligatoire pour date/datetime : sans format déclaré, une chaîne
// comme "01/02/2026" est ambiguë (jour/mois ou mois/jour ?). La validation du
// contenu exact du format (tokens reconnus) est du ressort du moteur de parsing
// de fichiers (à venir), pas de ce module — ici on vérifie juste que c'est une
// chaîne non vide, pour ne pas coupler ce contrat à l'implémentation du moteur.
const dateColumnSchema = z.object({
  ...baseColumnFields,
  type: z.literal("date"),
  dateFormat: z.string().min(1, "dateFormat est obligatoire pour une colonne de type date."),
  min: z.string().min(1).optional(),
  max: z.string().min(1).optional(),
});

const datetimeColumnSchema = z.object({
  ...baseColumnFields,
  type: z.literal("datetime"),
  dateFormat: z.string().min(1, "dateFormat est obligatoire pour une colonne de type datetime."),
  min: z.string().min(1).optional(),
  max: z.string().min(1).optional(),
});

/**
 * Discriminée sur `type` : chaque type de colonne n'expose que les contraintes qui
 * ont un sens pour lui (ex. `pattern`/`minLength` n'existent pas au niveau des
 * types sur une colonne `integer`, pas seulement par convention).
 */
export const columnDefinitionSchema = z.discriminatedUnion("type", [
  stringColumnSchema,
  integerColumnSchema,
  numberColumnSchema,
  booleanColumnSchema,
  dateColumnSchema,
  datetimeColumnSchema,
]);

export type ColumnDefinition = z.infer<typeof columnDefinitionSchema>;

const schemaDefinitionShape = z.object({
  columns: z.array(columnDefinitionSchema).min(1, "Un schéma doit déclarer au moins une colonne."),
  allowExtraColumns: z.boolean().default(false),
  trimStrings: z.boolean().default(true),
  caseSensitiveHeaders: z.boolean().default(false),
  duplicateKeyColumns: z.array(z.string()).optional(),
});

export const schemaDefinitionSchema = schemaDefinitionShape.superRefine((value, ctx) => {
  const columnNames = new Set<string>();
  for (const column of value.columns) {
    if (columnNames.has(column.name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Nom de colonne en double : "${column.name}".`,
        path: ["columns"],
      });
    }
    columnNames.add(column.name);
  }

  for (const [index, column] of value.columns.entries()) {
    if (
      "minLength" in column &&
      "maxLength" in column &&
      column.minLength !== undefined &&
      column.maxLength !== undefined &&
      column.minLength > column.maxLength
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `minLength (${column.minLength}) ne peut pas dépasser maxLength (${column.maxLength}).`,
        path: ["columns", index, "minLength"],
      });
    }

    if (
      "min" in column &&
      "max" in column &&
      column.min !== undefined &&
      column.max !== undefined &&
      column.min > column.max
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `min (${column.min}) ne peut pas dépasser max (${column.max}).`,
        path: ["columns", index, "min"],
      });
    }

    if ("pattern" in column && column.pattern !== undefined) {
      try {
        new RegExp(column.pattern);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `pattern n'est pas une expression régulière valide : "${column.pattern}".`,
          path: ["columns", index, "pattern"],
        });
      }
    }
  }

  if (value.duplicateKeyColumns) {
    for (const keyColumn of value.duplicateKeyColumns) {
      if (!columnNames.has(keyColumn)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicateKeyColumns référence une colonne inconnue : "${keyColumn}".`,
          path: ["duplicateKeyColumns"],
        });
      }
    }
  }
});

export type SchemaDefinition = z.infer<typeof schemaDefinitionSchema>;

export interface SchemaDefinitionValidationError {
  path: string;
  message: string;
}

export type SchemaDefinitionParseResult =
  | { success: true; data: SchemaDefinition }
  | { success: false; errors: SchemaDefinitionValidationError[] };

/**
 * Point d'entrée public : valide une valeur inconnue (payload API, JSON stocké en
 * base, fixture de test) contre le format de schéma. Ne lève jamais — retourne un
 * résultat discriminé avec des messages d'erreur lisibles, prêts à être affichés
 * dans un formulaire ou loggés.
 */
export function parseSchemaDefinition(input: unknown): SchemaDefinitionParseResult {
  const result = schemaDefinitionSchema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));

  return { success: false, errors };
}
