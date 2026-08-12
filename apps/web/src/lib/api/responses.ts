import { NextResponse } from "next/server";
import type { ZodIssue } from "zod";

export interface ApiErrorBody {
  error: {
    message: string;
    issues?: { path: string; message: string }[];
  };
}

export function jsonError(
  status: number,
  message: string,
  zodIssues?: ZodIssue[],
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = {
    error: {
      message,
      ...(zodIssues
        ? {
            issues: zodIssues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          }
        : {}),
    },
  };
  return NextResponse.json(body, { status });
}
