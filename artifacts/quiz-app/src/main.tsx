import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Auth is now handled via HttpOnly cookie set by the server.
// The browser automatically attaches the cookie on every request
// (custom-fetch.ts uses credentials: "include").
// No client-side token management is needed.

createRoot(document.getElementById("root")!).render(<App />);
