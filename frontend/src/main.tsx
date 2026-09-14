import React from "react";
import ReactDOM from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
import { initTheme } from "@/lib/theme";
import "./index.css";

// index.html already set the theme attribute before paint; this keeps the
// module's state and the DOM in agreement for the rest of the session.
initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    {/* Vercel Web Analytics. Renders nothing and only reports from the
        deployment — in `npm run dev` it runs in debug mode and sends nothing. */}
    <Analytics />
  </React.StrictMode>
);
