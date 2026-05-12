import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#090b10",
        panel: "#111620",
        mist: "#9fb0c6",
        limeglow: "#b6f36d",
        cyanline: "#62e6ff",
        rosehot: "#ff6b9a"
      },
      boxShadow: {
        glow: "0 0 40px rgba(98, 230, 255, 0.15)"
      }
    }
  },
  plugins: []
};

export default config;
