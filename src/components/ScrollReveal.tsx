"use client";

import { useEffect } from "react";

// Fades the landing page sections in as they scroll into view.
// It only hides anything once this script is running, so without JavaScript, without
// IntersectionObserver, or with "reduce motion" turned on, every section is simply shown.
export default function ScrollReveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".lp");
    if (!root || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const sections = Array.from(root.querySelectorAll<HTMLElement>(".lp-reveal"));
    // Sections already on screen (or above it, after a reload) are shown at once, so nothing flashes.
    const below = sections.filter((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) {
        el.classList.add("is-in");
        return false;
      }
      return true;
    });

    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    root.classList.add("lp-js-reveal");
    below.forEach((el) => io.observe(el));

    return () => {
      io.disconnect();
      root.classList.remove("lp-js-reveal");
      sections.forEach((el) => el.classList.remove("is-in"));
    };
  }, []);

  return null;
}
