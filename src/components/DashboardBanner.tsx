import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Play, Sparkles, Shield, Zap } from "lucide-react";
import { playClick } from "@/lib/sound";

interface BannerSlide {
  image: string;
  title: string;
  subtitle: string;
  badge: string;
  icon: string;
  accent: string;
}

const SLIDES: BannerSlide[] = [
  {
    image: "https://traxion.gg/wp-content/uploads/2024/08/CarX-Street-PC-2024-1024x576.jpg",
    title: "MYANMAR CARX STREET SUITE",
    subtitle: "Real-time Cloud Save Synchronizer & Garage Architect",
    badge: "v1.2 ACTIVE",
    icon: "🏎️",
    accent: "from-amber-500 to-yellow-400",
  },
  {
    image: "https://image.api.playstation.com/vulcan/ap/rnd/202504/0212/4ae246f4acce632ee477520042a69e67357685132600f50e.jpg",
    title: "MAX OUT CASH & GOLD",
    subtitle: "50,000,000 Silver, 9,999 Gold, Level 50 XP in 1-Click",
    badge: "INSTANT SYNC",
    icon: "💰",
    accent: "from-emerald-400 to-teal-500",
  },
  {
    image: "https://i.pinimg.com/1200x/f5/c1/7b/f5c17b1c7634dfef25157246f95941a5.jpg",
    title: "UNLOCK 69+ SUPERCARS & CLUBS",
    subtitle: "Unlock all 22 Clubs, 52 Houses, and Elite Custom Kits",
    badge: "SAFE ANTI-BAN",
    icon: "👑",
    accent: "from-purple-400 to-pink-500",
  },
];

export const DashboardBanner: React.FC = () => {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % SLIDES.length);
    }, 6500);
    return () => clearInterval(timer);
  }, []);

  const handlePrev = () => {
    playClick();
    setCurrent((prev) => (prev - 1 + SLIDES.length) % SLIDES.length);
  };

  const handleNext = () => {
    playClick();
    setCurrent((prev) => (prev + 1) % SLIDES.length);
  };

  return (
    <div className="relative h-[220px] sm:h-[260px] md:h-[300px] w-full rounded-3xl overflow-hidden border border-zinc-700/60 bg-black/60 group shadow-[0_15px_40px_rgba(0,0,0,0.8),0_0_25px_rgba(245,158,11,0.1)] select-none">
      {/* Slides Container */}
      {SLIDES.map((slide, idx) => {
        const isActive = idx === current;
        return (
          <div
            key={idx}
            className={`absolute inset-0 w-full h-full transition-opacity duration-1000 ${
              isActive ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
            }`}
          >
            {/* Background Zooming Image */}
            <div className="absolute inset-0 overflow-hidden">
              <img
                src={slide.image}
                alt={slide.title}
                className={`w-full h-full object-cover origin-center transform ${
                  isActive ? "scale-105 transition-transform duration-7000 ease-out" : "scale-100"
                }`}
              />
              {/* Dark Gradient Overlays */}
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/90 via-zinc-950/40 to-transparent" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,158,11,0.15),transparent_60%)]" />
            </div>

            {/* Slide Content Overlay */}
            <div className="absolute bottom-5 left-5 right-5 sm:bottom-7 sm:left-7 sm:right-7 z-20 space-y-2 max-w-xl">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black font-mono tracking-widest bg-black/70 text-amber-300 border border-amber-400/40 shadow-[0_0_12px_rgba(245,158,11,0.3)] uppercase backdrop-blur-md">
                  <span>{slide.icon}</span>
                  <span>{slide.badge}</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900/60 px-2 py-0.5 rounded-full border border-zinc-700/50">
                  SLIDE {idx + 1}/{SLIDES.length}
                </span>
              </div>
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl md:text-3xl font-black font-sans text-white tracking-wide uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                  {slide.title}
                </h2>
                <p className="text-xs sm:text-sm font-mono text-zinc-300 font-medium drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] line-clamp-2">
                  {slide.subtitle}
                </p>
              </div>
            </div>
          </div>
        );
      })}

      {/* Cyber Corner Markers */}
      <div className="absolute top-3 left-3 w-3 h-3 border-t-2 border-l-2 border-amber-400/60 z-20 pointer-events-none" />
      <div className="absolute top-3 right-3 w-3 h-3 border-t-2 border-r-2 border-amber-400/60 z-20 pointer-events-none" />

      {/* Slide Navigation Arrows */}
      <button
        onClick={handlePrev}
        className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/60 border border-zinc-700/80 hover:border-amber-400 hover:bg-black/90 text-white rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-md cursor-pointer"
        title="Previous Slide"
        aria-label="Previous Slide"
      >
        <ChevronLeft className="h-4 w-4 text-zinc-200" />
      </button>
      <button
        onClick={handleNext}
        className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/60 border border-zinc-700/80 hover:border-amber-400 hover:bg-black/90 text-white rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-md cursor-pointer"
        title="Next Slide"
        aria-label="Next Slide"
      >
        <ChevronRight className="h-4 w-4 text-zinc-200" />
      </button>

      {/* Bottom Dash/Pagination Indicators */}
      <div className="absolute bottom-4 right-5 sm:right-7 z-20 flex items-center gap-2">
        {SLIDES.map((_, idx) => (
          <button
            key={idx}
            onClick={() => { playClick(); setCurrent(idx); }}
            className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
              idx === current
                ? "w-7 bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.8)]"
                : "w-2.5 bg-white/25 hover:bg-white/50"
            }`}
            title={`Go to slide ${idx + 1}`}
            aria-label={`Slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
};
