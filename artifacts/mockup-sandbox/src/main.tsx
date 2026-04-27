/**
 * Mockup Sandbox Entry Point
 *
 * Mounts the preview application into the DOM.
 */
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
