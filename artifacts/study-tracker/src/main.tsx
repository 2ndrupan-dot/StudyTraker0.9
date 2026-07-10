import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Browsers restore the previous scroll offset on refresh/back-forward nav
// before layout (fonts, images, async data) has finished settling. Combined
// with our sticky section headers, that stale offset makes the header appear
// to overlap the content until the user manually scrolls and the sticky
// element's position gets recalculated. Taking manual control avoids it.
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);

createRoot(document.getElementById("root")!).render(<App />);
