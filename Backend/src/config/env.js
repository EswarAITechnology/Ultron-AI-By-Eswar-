export function validateEnvironment() {
  const required = [
    "GEMINI_API_KEY",
    "OPENROUTER_API_KEY",
    "FISH_API_KEY"
  ];

  const missing = required.filter(
    key => !process.env[key]
  );

  if (missing.length) {
    console.warn(
      "Missing optional or required API configuration:",
      missing.join(", ")
    );
  }

  if (!process.env.GEMINI_MODEL) {
    throw new Error("GEMINI_MODEL is not configured");
  }

  if (!process.env.OPENROUTER_MODEL) {
    throw new Error("OPENROUTER_MODEL is not configured");
  }
}
 