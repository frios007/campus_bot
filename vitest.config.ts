import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		env: { CONVERSATION_LOGGING: "false", GEMINI_API_KEY: "" },
	},
});
