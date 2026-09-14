import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
import { initTheme } from "@/lib/theme";
import "./index.css";

// index.html already set the theme attribute before paint; this keeps the
// module's state and the DOM in agreement for the rest of the session.
initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
    {/* Vercel Web Analytics. Renders nothing and only reports from the
        deployment — in `npm run dev` it runs in debug mode and sends nothing. */}
    {/* Vercel Web Analytics. Renders nothing, and reports only from the
        deployment — in `npm run dev` it runs in debug mode and sends nothing.
        It patches `history`, so each route below counts as its own page. */}
    <Analytics />
  </React.StrictMode>
);
