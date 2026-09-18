/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Every colour resolves through a CSS variable (defined per theme in
      // index.css), so light/dark is a single attribute on <html> rather than
      // a conditional in each component. <alpha-value> keeps bg-panel/60 etc.
      colors: {
        bg: "rgb(var(--c-bg) / <alpha-value>)",
        panel: "rgb(var(--c-panel) / <alpha-value>)",
        border: "rgb(var(--c-border) / <alpha-value>)",
        // The outline round a box, as opposed to a rule inside one.
        edge: "rgb(var(--c-edge) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        mute: "rgb(var(--c-mute) / <alpha-value>)",
        accent: "rgb(var(--c-accent) / <alpha-value>)",
        accent2: "rgb(var(--c-accent2) / <alpha-value>)",
        good: "rgb(var(--c-good) / <alpha-value>)",
        bad: "rgb(var(--c-bad) / <alpha-value>)",
        onAccent: "rgb(var(--c-on-accent) / <alpha-value>)",
        onAccent2: "rgb(var(--c-on-accent2) / <alpha-value>)",
      },
      fontFamily: {
        // Resolved from the CSS variable in index.css, so there is one place
        // to change the typeface rather than two that can disagree.
        sans: ["var(--font-sans)"],
        display: ["var(--font-display)"],
      },
      // Named here rather than as an arbitrary `animate-[spin_1.1s_...]`:
      // Tailwind only emits `@keyframes spin` for its own `animate-spin`
      // utility, so an arbitrary value naming it compiles to an animation
      // pointing at keyframes that were never written.
      keyframes: {
        "ball-spin": { to: { transform: "rotate(360deg)" } },
      },
      animation: {
        "ball-spin": "ball-spin 2.6s linear infinite",
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.3)",
      },
    },
  },
  plugins: [],
};
