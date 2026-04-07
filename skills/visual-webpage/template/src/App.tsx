/**
 * Main app container with scroll-snap.
 *
 * When generating a presentation, import your slides here and add them
 * to the `slides` array. Each slide is a React component wrapped in
 * <SlideContainer>.
 *
 * Example:
 *   import Intro from "./slides/01-intro";
 *   import Architecture from "./slides/02-architecture";
 *   const slides = [<Intro />, <Architecture />];
 */

import "./styles/theme.css";

const slides: React.ReactNode[] = [
  // Import and add your slides here
];

export default function App() {
  return (
    <div className="scroll-container">
      {slides.map((slide, i) => (
        <div key={i} className="slide-snap">
          {slide}
        </div>
      ))}
    </div>
  );
}
