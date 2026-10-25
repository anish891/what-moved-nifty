import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#000000",
        cut: "#22d3ee",
      },
    },
  },
  plugins: [],
};

export default config;
