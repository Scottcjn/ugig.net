import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "OpenAPI Spec | ugig.net",
  description: "OpenAPI/Swagger specification for the ugig.net REST API.",
};

export default function OpenApiPage() {
  // The OpenAPI spec is a JSON file served at /api/openapi.json
  // Redirect to the docs page which has the Swagger UI viewer
  redirect("/docs");
}
