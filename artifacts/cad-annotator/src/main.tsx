/**
 * Application Entry Point
 *
 * Mounts the React application into the DOM. The root element is defined
 * in `index.html` as `<div id="root">`.
 */
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
